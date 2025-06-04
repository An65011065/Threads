class BrowsingGraphVisualizer {
    constructor() {
        this.svg = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.clusters = new Map();
        this.selectedNode = null;
        this.zoomBehavior = null;
        this.data = null;

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Network-wide metrics
        this.networkMetrics = {
            avgDwellTime: 0,
            avgPageEntropy: 0,
            avgReturnVelocity: 0,
            // New network science metrics
            networkDensity: 0, // How interconnected the browsing graph is
            sessionFocus: 0, // Concentration vs exploration (0-100)
            domainDiversity: 0, // Number of unique domains visited
            navigationEfficiency: 0, // How direct the browsing paths are (0-100)
            clusteringCoefficient: 0, // How much nodes cluster together
            averagePathLength: 0, // Average distance between connected nodes
        };

        this.init();
    }

    init() {
        this.setupSVG();
        this.setupControls();
        this.loadData();
        window.addEventListener("resize", () => this.handleResize());
    }

    setupSVG() {
        this.svg = d3
            .select("#graph")
            .attr("width", this.width)
            .attr("height", this.height);

        // Setup zoom
        this.zoomBehavior = d3
            .zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                this.svg
                    .select(".graph-container")
                    .attr("transform", event.transform);
            });

        this.svg.call(this.zoomBehavior);

        // Create main container
        this.svg.append("g").attr("class", "graph-container");

        // Add click handler to clear selection when clicking on empty space
        this.svg.on("click", (event) => {
            // Only clear if clicking on the SVG background, not on nodes
            if (
                event.target === this.svg.node() ||
                event.target.classList.contains("graph-container")
            ) {
                this.clearSelection();
            }
        });
    }

    setupControls() {
        document
            .getElementById("refreshBtn")
            .addEventListener("click", () => this.loadData());
        document
            .getElementById("exportBtn")
            .addEventListener("click", () => this.exportGraph());

        // Initialize evolution controls as part of standard interface
        this.createEvolutionControls();
    }

    async loadData() {
        const loading = document.getElementById("loading");
        loading.classList.remove("hidden");

        try {
            console.log("📦 Loading graph data from storage...");

            const result = await chrome.storage.local.get(["graphData"]);
            const data = result.graphData;

            console.log("📦 Graph received data:", data);

            if (!data) {
                throw new Error(
                    "No graph data found. Please open graph from extension popup.",
                );
            }

            if (data.error) {
                throw new Error(data.error);
            }

            if (!data.sessions || !Array.isArray(data.sessions)) {
                throw new Error(
                    "Invalid data format: missing or invalid sessions array",
                );
            }

            if (data.sessions.length === 0) {
                throw new Error("No browsing sessions found");
            }

            this.data = data;
            this.processData(data);
            this.calculateNetworkMetrics();
            this.updateURLCount();
            this.updateMetricsDisplay();
            this.createGraph();
        } catch (error) {
            console.error("❌ Error loading graph data:", error);
            this.showError(error.message || "Failed to load browsing data");
        } finally {
            loading.classList.add("hidden");
        }
    }

    processData(data) {
        this.nodes = [];
        this.links = [];
        this.clusters.clear();
        const nodeMap = new Map();
        let nodeId = 0;

        console.log("🐛 DEBUG: Raw data structure:", data);

        // Process sessions into nodes and links
        data.sessions.forEach((session, sessionIndex) => {
            if (!session.domains || session.domains.length === 0) return;

            console.log(`🐛 DEBUG: Session ${sessionIndex}:`, session);

            const clusterId = session.tabId;
            const clusterColor = this.getClusterColor(sessionIndex);

            this.clusters.set(clusterId, {
                id: clusterId,
                sessionId: session.sessionId,
                isActive: session.isActive,
                color: clusterColor,
                nodes: [],
                firstUrl: null,
                urlSequence: [], // Track the actual chronological sequence
            });

            // First, collect ALL URLs in chronological order across all domains
            let allUrls = [];

            // WORKAROUND: Try to reconstruct chronological sequence from grouped domain data
            // Since extension groups by domain, we'll simulate interleaved browsing for sessions with multiple domains
            const domainArrays = session.domains.map((domain) => ({
                domain: domain.domain,
                urls: domain.urls || [],
            }));

            if (domainArrays.length > 1) {
                // Multiple domains detected - simulate interleaved browsing
                console.log(
                    `🔄 DETECTED MULTI-DOMAIN SESSION - Simulating chronological interleaving for ${domainArrays.length} domains`,
                );

                const maxUrls = Math.max(
                    ...domainArrays.map((d) => d.urls.length),
                );
                let timestamp = session.lastUpdate;

                // Interleave URLs from different domains to simulate back-and-forth browsing
                for (let i = 0; i < maxUrls; i++) {
                    domainArrays.forEach((domainObj) => {
                        if (i < domainObj.urls.length) {
                            allUrls.push({
                                url: domainObj.urls[i],
                                domain: domainObj.domain,
                                timestamp: timestamp,
                                isSimulated: true,
                            });
                            timestamp += 1000; // 1 second apart
                        }
                    });
                }

                console.log(
                    `🔄 SIMULATED SEQUENCE: ${allUrls
                        .map((u) => u.domain)
                        .join(" → ")}`,
                );
            } else {
                // Single domain - process normally
                session.domains.forEach((domain) => {
                    console.log(
                        `🐛 DEBUG: Domain ${domain.domain}:`,
                        domain.urls,
                    );
                    (domain.urls || []).forEach((url) => {
                        allUrls.push({
                            url: url,
                            domain: domain.domain,
                            timestamp:
                                session.lastUpdate + allUrls.length * 1000,
                            isSimulated: false,
                        });
                    });
                });
            }

            console.log(
                `🐛 DEBUG: All URLs for session ${sessionIndex}:`,
                allUrls.map((u) => u.url),
            );

            // Now process URLs in sequence to create proper nodes and links
            let previousNodeKey = null;

            allUrls.forEach((urlData, sequenceIndex) => {
                const { url, domain } = urlData;
                const nodeKey = `${clusterId}-${url}`;

                console.log(
                    `🐛 DEBUG: Processing URL ${sequenceIndex}: ${url}, nodeKey: ${nodeKey}`,
                );

                // Track the sequence
                this.clusters.get(clusterId).urlSequence.push(url);

                if (!nodeMap.has(nodeKey)) {
                    // Create new node for first visit to this URL
                    const node = {
                        id: nodeId++,
                        url: url,
                        domain: domain,
                        visitCount: 1,
                        tabId: clusterId,
                        sessionId: session.sessionId,
                        isActive: session.isActive,
                        cluster: clusterId,
                        clusterColor: clusterColor,
                        // Store metrics as arrays for multiple visits
                        dwellTimes: [this.calculateDwellTime(url, { domain })],
                        entropies: [this.calculatePageEntropy(url, { domain })],
                        returnVelocities: [
                            this.calculateReturnVelocity(url, { domain }),
                        ],
                        visitTimestamps: [urlData.timestamp],
                        visitSequence: [sequenceIndex], // Track when in sequence this URL was visited
                        x: this.width / 2 + (Math.random() - 0.5) * 100,
                        y: this.height / 2 + (Math.random() - 0.5) * 100,
                    };

                    // Add computed properties for current metrics (latest visit)
                    node.dwellTime = node.dwellTimes[0];
                    node.entropy = node.entropies[0];
                    node.returnVelocity = node.returnVelocities[0];

                    this.nodes.push(node);
                    nodeMap.set(nodeKey, node);
                    this.clusters.get(clusterId).nodes.push(node);

                    if (!this.clusters.get(clusterId).firstUrl) {
                        this.clusters.get(clusterId).firstUrl = url;
                    }

                    console.log(
                        `🆕 Created new node: ${nodeKey} (ID: ${node.id})`,
                    );
                } else {
                    // REVISIT: Add another visit to existing node
                    const existingNode = nodeMap.get(nodeKey);
                    existingNode.visitCount++;
                    existingNode.dwellTimes.push(
                        this.calculateDwellTime(url, { domain }),
                    );
                    existingNode.entropies.push(
                        this.calculatePageEntropy(url, { domain }),
                    );
                    existingNode.returnVelocities.push(
                        this.calculateReturnVelocity(url, { domain }),
                    );
                    existingNode.visitTimestamps.push(urlData.timestamp);
                    existingNode.visitSequence.push(sequenceIndex);

                    // Update current metrics to latest visit
                    existingNode.dwellTime =
                        existingNode.dwellTimes[
                            existingNode.dwellTimes.length - 1
                        ];
                    existingNode.entropy =
                        existingNode.entropies[
                            existingNode.entropies.length - 1
                        ];
                    existingNode.returnVelocity =
                        existingNode.returnVelocities[
                            existingNode.returnVelocities.length - 1
                        ];

                    console.log(
                        `🔄 Revisit detected: ${url} (visit #${existingNode.visitCount})`,
                    );
                }

                // Create links based on actual browsing sequence
                if (previousNodeKey && previousNodeKey !== nodeKey) {
                    console.log(
                        `🔗 Attempting to create link: ${previousNodeKey} → ${nodeKey}`,
                    );

                    const sourceNode = nodeMap.get(previousNodeKey);
                    const targetNode = nodeMap.get(nodeKey);

                    if (sourceNode && targetNode) {
                        // Check if this exact link already exists (same direction)
                        const existingLink = this.links.find(
                            (link) =>
                                link.source === sourceNode.id &&
                                link.target === targetNode.id,
                        );

                        if (existingLink) {
                            // Increase weight for repeated navigation
                            existingLink.weight =
                                (existingLink.weight || 1) + 1;
                            existingLink.traversalCount =
                                (existingLink.traversalCount || 1) + 1;
                            console.log(
                                `🔗 Link weight increased: ${sourceNode.url} → ${targetNode.url} (weight: ${existingLink.weight})`,
                            );
                        } else {
                            // Create new directed link
                            this.links.push({
                                source: sourceNode.id,
                                target: targetNode.id,
                                type: "navigation",
                                tabId: clusterId,
                                weight: 1,
                                traversalCount: 1,
                                sourceUrl: sourceNode.url,
                                targetUrl: targetNode.url,
                            });
                            console.log(
                                `🆕 New link: ${sourceNode.url} → ${targetNode.url}`,
                            );
                        }
                    } else {
                        console.log(
                            `❌ Could not find nodes for link: ${previousNodeKey} → ${nodeKey}`,
                        );
                    }
                }

                // Update previous node for next iteration
                previousNodeKey = nodeKey;
            });
        });

        console.log(
            `📊 Processed: ${this.nodes.length} unique nodes, ${this.links.length} directed links, ${this.clusters.size} clusters`,
        );

        // Log statistics about revisits and loops
        const revisitStats = this.nodes.filter((node) => node.visitCount > 1);
        const loopLinks = this.links.filter((link) => link.weight > 1);

        if (revisitStats.length > 0) {
            console.log(
                `🔄 ${
                    revisitStats.length
                } nodes have multiple visits, max visits: ${Math.max(
                    ...revisitStats.map((n) => n.visitCount),
                )}`,
            );
        }
        if (loopLinks.length > 0) {
            console.log(
                `🔗 ${loopLinks.length} links have multiple traversals, creating navigation patterns`,
            );
        }

        // Log a sample of the URL sequence for debugging
        this.clusters.forEach((cluster, clusterId) => {
            if (cluster.urlSequence.length > 0) {
                console.log(
                    `📍 Cluster ${clusterId} sequence: ${cluster.urlSequence
                        .slice(0, 10)
                        .map(
                            (url) =>
                                url.split("/").pop() ||
                                url.split("/")[2] ||
                                url,
                        )
                        .join(" → ")}${
                        cluster.urlSequence.length > 10 ? "..." : ""
                    }`,
                );
            }
        });
    }

    calculateDwellTime(url, domain) {
        // Simulate dwell time based on URL characteristics
        const baseTime = Math.random() * 120; // 0-120 seconds
        const domainMultiplier = domain.domain.includes("youtube")
            ? 5
            : domain.domain.includes("github")
            ? 3
            : domain.domain.includes("google")
            ? 0.5
            : 1;
        return Math.max(1, baseTime * domainMultiplier);
    }

    calculatePageEntropy(url, domain) {
        // Simulate entropy based on URL complexity and domain type
        const urlComplexity = (url.split("/").length - 3) * 0.1;
        const paramCount = (url.split("?")[1] || "").split("&").length * 0.05;
        const baseEntropy = Math.random() * 2 + urlComplexity + paramCount;
        return Math.min(5, Math.max(0.1, baseEntropy));
    }

    calculateReturnVelocity(url, domain) {
        // Simulate return probability
        const isMainPage = url.split("/").length <= 4;
        const baseVelocity = Math.random() * 50;
        const mainPageBonus = isMainPage ? 30 : 0;
        return Math.min(100, baseVelocity + mainPageBonus);
    }

    calculateNetworkMetrics() {
        if (this.nodes.length === 0) return;

        // Calculate basic network averages
        this.networkMetrics.avgDwellTime =
            this.nodes.reduce((sum, node) => sum + node.dwellTime, 0) /
            this.nodes.length;
        this.networkMetrics.avgPageEntropy =
            this.nodes.reduce((sum, node) => sum + node.entropy, 0) /
            this.nodes.length;
        this.networkMetrics.avgReturnVelocity =
            this.nodes.reduce((sum, node) => sum + node.returnVelocity, 0) /
            this.nodes.length;

        // Calculate new network science metrics
        this.calculateNetworkDensity();
        this.calculateSessionFocus();
        this.calculateDomainDiversity();
        this.calculateNavigationEfficiency();
        this.calculateClusteringCoefficient();
        this.calculateAveragePathLength();
    }

    calculateNetworkDensity() {
        const n = this.nodes.length;
        if (n < 2) {
            this.networkMetrics.networkDensity = 0;
            return;
        }
        // Density = actual edges / possible edges
        const maxPossibleEdges = (n * (n - 1)) / 2; // Undirected graph
        this.networkMetrics.networkDensity =
            (this.links.length / maxPossibleEdges) * 100;
    }

    calculateSessionFocus() {
        // Measure concentration vs exploration using domain time distribution
        const domainTimes = new Map();
        this.nodes.forEach((node) => {
            const domain = node.domain;
            domainTimes.set(
                domain,
                (domainTimes.get(domain) || 0) + node.dwellTime,
            );
        });

        const totalTime = Array.from(domainTimes.values()).reduce(
            (sum, time) => sum + time,
            0,
        );
        if (totalTime === 0) {
            this.networkMetrics.sessionFocus = 0;
            return;
        }

        // Calculate Gini coefficient for time distribution (0 = perfectly equal, 1 = all time on one domain)
        const times = Array.from(domainTimes.values()).sort((a, b) => a - b);
        const n = times.length;
        let giniSum = 0;

        times.forEach((time, i) => {
            giniSum += (2 * (i + 1) - n - 1) * time;
        });

        const gini = giniSum / (n * totalTime);
        this.networkMetrics.sessionFocus = gini * 100; // Convert to 0-100 scale
    }

    calculateDomainDiversity() {
        const uniqueDomains = new Set(this.nodes.map((node) => node.domain));
        this.networkMetrics.domainDiversity = uniqueDomains.size;
    }

    calculateNavigationEfficiency() {
        if (this.links.length === 0) {
            this.networkMetrics.navigationEfficiency = 0;
            return;
        }

        // Calculate how many links are within same domain vs cross-domain
        let sameDomainLinks = 0;
        this.links.forEach((link) => {
            const sourceNode = this.nodes.find(
                (n) => n.id === link.source.id || n.id === link.source,
            );
            const targetNode = this.nodes.find(
                (n) => n.id === link.target.id || n.id === link.target,
            );
            if (
                sourceNode &&
                targetNode &&
                sourceNode.domain === targetNode.domain
            ) {
                sameDomainLinks++;
            }
        });

        // Higher efficiency means more focused, domain-coherent browsing
        this.networkMetrics.navigationEfficiency =
            (sameDomainLinks / this.links.length) * 100;
    }

    calculateClusteringCoefficient() {
        if (this.nodes.length < 3) {
            this.networkMetrics.clusteringCoefficient = 0;
            return;
        }

        // Build adjacency list
        const adj = new Map();
        this.nodes.forEach((node) => adj.set(node.id, new Set()));

        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            adj.get(sourceId)?.add(targetId);
            adj.get(targetId)?.add(sourceId);
        });

        let totalCoeff = 0;
        let validNodes = 0;

        this.nodes.forEach((node) => {
            const neighbors = adj.get(node.id);
            const degree = neighbors.size;

            if (degree < 2) return; // Need at least 2 neighbors for clustering

            let triangles = 0;
            const neighborsArray = Array.from(neighbors);

            // Count triangles (connections between neighbors)
            for (let i = 0; i < neighborsArray.length; i++) {
                for (let j = i + 1; j < neighborsArray.length; j++) {
                    if (adj.get(neighborsArray[i])?.has(neighborsArray[j])) {
                        triangles++;
                    }
                }
            }

            const possibleTriangles = (degree * (degree - 1)) / 2;
            totalCoeff += triangles / possibleTriangles;
            validNodes++;
        });

        this.networkMetrics.clusteringCoefficient =
            validNodes > 0 ? (totalCoeff / validNodes) * 100 : 0;
    }

    calculateAveragePathLength() {
        if (this.nodes.length < 2) {
            this.networkMetrics.averagePathLength = 0;
            return;
        }

        // Build adjacency list for BFS
        const adj = new Map();
        this.nodes.forEach((node) => adj.set(node.id, []));

        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            adj.get(sourceId)?.push(targetId);
            adj.get(targetId)?.push(sourceId);
        });

        let totalDistance = 0;
        let pathCount = 0;

        // Calculate shortest paths between all pairs (sample for performance)
        const sampleSize = Math.min(10, this.nodes.length); // Sample to avoid O(n³) complexity
        const sampleNodes = this.nodes.slice(0, sampleSize);

        sampleNodes.forEach((startNode) => {
            const distances = new Map();
            const queue = [startNode.id];
            distances.set(startNode.id, 0);

            while (queue.length > 0) {
                const current = queue.shift();
                const currentDist = distances.get(current);

                adj.get(current)?.forEach((neighbor) => {
                    if (!distances.has(neighbor)) {
                        distances.set(neighbor, currentDist + 1);
                        queue.push(neighbor);
                    }
                });
            }

            // Add distances to total
            sampleNodes.forEach((endNode) => {
                if (startNode.id !== endNode.id && distances.has(endNode.id)) {
                    totalDistance += distances.get(endNode.id);
                    pathCount++;
                }
            });
        });

        this.networkMetrics.averagePathLength =
            pathCount > 0 ? totalDistance / pathCount : 0;
    }

    updateURLCount() {
        // Count URLs visited in the last 24 hours
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        let urlsLast24h = 0;
        if (this.data && this.data.sessions) {
            this.data.sessions.forEach((session) => {
                if (session.lastUpdate >= oneDayAgo) {
                    session.domains.forEach((domain) => {
                        urlsLast24h += domain.urls ? domain.urls.length : 0;
                    });
                }
            });
        }

        document.getElementById("urlCount").textContent = `${urlsLast24h} tabs`;
    }

    updateMetricsDisplay(hoveredNode = null) {
        const metrics = hoveredNode || this.networkMetrics;

        if (hoveredNode) {
            // Show individual node metrics
            document.getElementById("dwellTime").textContent =
                this.formatDwellTime(metrics.dwellTime);
            document.getElementById("pageEntropy").textContent =
                metrics.entropy.toFixed(2);
            document.getElementById(
                "returnVelocity",
            ).textContent = `${metrics.returnVelocity.toFixed(1)}%`;

            // For individual nodes, show network averages for the network science metrics
            document.getElementById(
                "networkDensity",
            ).textContent = `${this.networkMetrics.networkDensity.toFixed(1)}%`;
            document.getElementById(
                "sessionFocus",
            ).textContent = `${this.networkMetrics.sessionFocus.toFixed(1)}%`;
            document.getElementById("domainDiversity").textContent =
                this.networkMetrics.domainDiversity.toString();
            document.getElementById(
                "navigationEfficiency",
            ).textContent = `${this.networkMetrics.navigationEfficiency.toFixed(
                1,
            )}%`;
            document.getElementById(
                "clusteringCoefficient",
            ).textContent = `${this.networkMetrics.clusteringCoefficient.toFixed(
                1,
            )}%`;
            document.getElementById("averagePathLength").textContent =
                this.networkMetrics.averagePathLength.toFixed(1);
        } else {
            // Show network-wide metrics
            document.getElementById("dwellTime").textContent =
                this.formatDwellTime(metrics.avgDwellTime);
            document.getElementById("pageEntropy").textContent =
                metrics.avgPageEntropy.toFixed(2);
            document.getElementById(
                "returnVelocity",
            ).textContent = `${metrics.avgReturnVelocity.toFixed(1)}%`;

            // Network science metrics
            document.getElementById(
                "networkDensity",
            ).textContent = `${metrics.networkDensity.toFixed(1)}%`;
            document.getElementById(
                "sessionFocus",
            ).textContent = `${metrics.sessionFocus.toFixed(1)}%`;
            document.getElementById("domainDiversity").textContent =
                metrics.domainDiversity.toString();
            document.getElementById(
                "navigationEfficiency",
            ).textContent = `${metrics.navigationEfficiency.toFixed(1)}%`;
            document.getElementById(
                "clusteringCoefficient",
            ).textContent = `${metrics.clusteringCoefficient.toFixed(1)}%`;
            document.getElementById("averagePathLength").textContent =
                metrics.averagePathLength.toFixed(1);
        }
    }

    getClusterColor(index) {
        const colors = [
            "#4285f4",
            "#ff6b6b",
            "#4ecdc4",
            "#45b7d1",
            "#96ceb4",
            "#feca57",
            "#ff9ff3",
            "#54a0ff",
            "#5f27cd",
            "#00d2d3",
        ];
        return colors[index % colors.length];
    }

    createGraph() {
        const container = this.svg.select(".graph-container");
        container.selectAll("*").remove();

        if (this.nodes.length === 0) {
            this.showEmptyState();
            return;
        }

        // Create cluster hulls
        this.createClusterHulls(container);

        // Create links
        this.createLinks(container);

        // Create nodes
        this.createNodes(container);

        // Setup force simulation
        this.setupForceSimulation();
    }

    createClusterHulls(container) {
        this.hullGroup = container.append("g").attr("class", "hulls");
    }

    createLinks(container) {
        const linkGroup = container.append("g").attr("class", "links");

        this.linkElements = linkGroup
            .selectAll(".link")
            .data(this.links)
            .enter()
            .append("g")
            .attr("class", "link-group");

        // Add the link line
        this.linkElements
            .append("path")
            .attr("class", (d) => `link ${d.type}`)
            .attr("stroke", (d) => {
                if (d.weight > 3) return "#ff6b6b"; // Heavy traffic - red
                if (d.weight > 1) return "#feca57"; // Repeated path - yellow
                return "#4285f4"; // Single traversal - blue
            })
            .attr("stroke-width", (d) => Math.min(8, 1 + d.weight))
            .attr("opacity", (d) => Math.min(0.9, 0.4 + d.weight * 0.1))
            .attr("fill", "none")
            .attr("marker-end", "url(#arrowhead)")
            .on("mouseover", (event, d) => this.showLinkTooltip(event, d))
            .on("mouseout", () => this.hideTooltip());

        // Add arrowhead marker definition to SVG
        this.svg
            .append("defs")
            .append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#636e72");

        // Add weight labels for links with multiple traversals
        this.linkElements
            .filter((d) => d.weight > 1)
            .append("text")
            .text((d) => `×${d.weight}`)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .style("fill", "#2d3436")
            .style("background", "white")
            .style("padding", "2px")
            .style("border-radius", "3px")
            .style("pointer-events", "none");
    }

    createNodes(container) {
        const nodeGroup = container.append("g").attr("class", "nodes");

        this.nodeElements = nodeGroup
            .selectAll(".node")
            .data(this.nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .call(
                d3
                    .drag()
                    .on("start", (event, d) => this.dragStarted(event, d))
                    .on("drag", (event, d) => this.dragged(event, d))
                    .on("end", (event, d) => this.dragEnded(event, d)),
            )
            .on("click", (event, d) => this.selectNode(d))
            .on("dblclick", (event, d) => this.openNodeUrl(d))
            .on("mouseover", (event, d) => this.handleNodeHover(event, d))
            .on("mouseout", () => this.handleNodeOut());

        // Add circles to nodes
        this.nodeElements
            .append("circle")
            .attr("r", (d) =>
                Math.max(8, Math.min(20, d.visitCount * 2 + d.entropy * 2)),
            )
            .attr("fill", (d) => d.clusterColor)
            .attr("stroke", (d) => (d.visitCount > 1 ? "#ff6b6b" : "#2d3436"))
            .attr("stroke-width", (d) => (d.visitCount > 1 ? 3 : 2))
            .attr("opacity", (d) => (d.isActive ? 0.9 : 0.6));

        // Add visit count indicator for multiple visits
        this.nodeElements
            .filter((d) => d.visitCount > 1)
            .append("text")
            .text((d) => d.visitCount)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .style("fill", "white")
            .style("pointer-events", "none");

        // Add labels to nodes (now visible by default like in evolution)
        this.nodeElements
            .append("text")
            .text((d) => this.getNodeLabel(d))
            .attr(
                "dy",
                (d) =>
                    Math.max(
                        8,
                        Math.min(20, d.visitCount * 2 + d.entropy * 2),
                    ) + 18,
            )
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .style("fill", "#2d3436")
            .style("text-shadow", "1px 1px 2px rgba(255,255,255,0.8)")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .transition()
            .delay(300)
            .duration(400)
            .style("opacity", 1);
    }

    getNodeLabel(node) {
        return this.formatUrlForDisplay(node.url, {
            context: "label",
            maxLength: 15,
            pathLength: 5,
            queryLength: 8,
        });
    }

    getClusterName(url) {
        return this.formatUrlForDisplay(url, {
            context: "cluster",
            maxLength: 20,
            showPath: false, // Clusters show just domain
            fallback: "Unknown",
        });
    }

    cleanUrl(url) {
        return this.formatUrlForDisplay(url, {
            context: "tooltip",
            maxLength: 50,
        });
    }

    handleNodeHover(event, node) {
        // Get cluster information
        const cluster = this.clusters.get(node.tabId);

        if (cluster) {
            // Calculate detailed cluster information
            const clusterNodes = cluster.nodes;

            // Sort nodes by their original order in the session (chronological)
            const sortedNodes = [...clusterNodes].sort((a, b) => {
                // Use node ID as proxy for chronological order since they were created sequentially
                return a.id - b.id;
            });

            let totalTime = 0;
            let maxTime = -1;
            let maxTimeIndex = -1;

            // First pass: find max time and total
            sortedNodes.forEach((clusterNode, index) => {
                const dwellTime = clusterNode.dwellTime;
                totalTime += dwellTime;

                if (dwellTime > maxTime) {
                    maxTime = dwellTime;
                    maxTimeIndex = index;
                }
            });

            // Build detailed cluster info
            let clusterInfo = `<div style="font-weight: bold; margin-bottom: 8px; color: #2d3436;">Tab Cluster Details:</div>`;

            sortedNodes.forEach((clusterNode, index) => {
                const displayUrl = this.formatUrlForDisplay(clusterNode.url, {
                    context: "tooltip",
                    maxLength: 35,
                });

                // Only highlight the first URL found with maximum time
                const isHighest = index === maxTimeIndex;
                const style = isHighest
                    ? "background: rgba(66, 133, 244, 0.1); border-left: 3px solid #4285f4; padding: 2px 6px; margin: 1px 0; border-radius: 3px; font-weight: 500;"
                    : "padding: 2px 6px; margin: 1px 0;";

                // Calculate metrics to display (use total time for multiple visits)
                const displayTime =
                    clusterNode.visitCount > 1
                        ? clusterNode.dwellTimes.reduce(
                              (sum, time) => sum + time,
                              0,
                          )
                        : clusterNode.dwellTime;

                const visitIndicator =
                    clusterNode.visitCount > 1
                        ? ` <span style="color: #ff6b6b; font-weight: bold;">(${clusterNode.visitCount}×)</span>`
                        : "";

                clusterInfo += `<div style="${style}">
                    <div style="font-size: 12px; color: #2d3436;">${displayUrl}${visitIndicator}</div>
                    <div style="font-size: 10px; color: #636e72;">${this.formatDwellTime(
                        displayTime,
                    )}</div>
                </div>`;
            });

            // Add total time
            clusterInfo += `<div style="border-top: 1px solid #ddd; margin-top: 8px; padding-top: 6px; font-weight: bold; color: #2d3436;">
                Total Time: ${this.formatDwellTime(totalTime)}
            </div>`;

            document.getElementById("clusterInfo").innerHTML = clusterInfo;
        } else {
            document.getElementById("clusterInfo").innerHTML =
                '<div style="color: #636e72;">Tab cluster: Unknown</div>';
        }

        // Update metrics to show node-specific values (no individual URL info needed)
        this.updateMetricsDisplay(node);

        // Show tooltip
        this.showNodeTooltip(event, node);
    }

    handleNodeOut() {
        // Reset cluster display box
        document.getElementById("clusterInfo").innerHTML =
            '<div style="color: white;">Tab cluster: Hover over a node to see details</div>';

        // Reset URL display box to empty since we don't show individual URLs anymore
        document.getElementById("urlInfo").textContent = "";

        // Reset metrics to network averages
        this.updateMetricsDisplay();

        // Hide tooltip
        this.hideTooltip();
    }

    setupForceSimulation() {
        this.simulation = d3
            .forceSimulation(this.nodes)
            .force(
                "link",
                d3
                    .forceLink(this.links)
                    .id((d) => d.id)
                    .distance(100)
                    .strength(0.6),
            )
            .force("charge", d3.forceManyBody().strength(-500).distanceMax(250))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force(
                "collision",
                d3
                    .forceCollide()
                    .radius(
                        (d) =>
                            Math.max(
                                15,
                                Math.min(30, d.visitCount * 3 + d.entropy * 2),
                            ) + 10,
                    ),
            )
            .force("cluster", this.forceCluster())
            .on("tick", () => this.ticked());

        this.simulation.alpha(1).restart();
    }

    forceCluster() {
        const strength = 0.15;
        return (alpha) => {
            this.clusters.forEach((cluster) => {
                const nodes = cluster.nodes;
                if (nodes.length > 1) {
                    const centerX =
                        d3.mean(nodes, (d) => d.x) || this.width / 2;
                    const centerY =
                        d3.mean(nodes, (d) => d.y) || this.height / 2;

                    nodes.forEach((node) => {
                        const dx = centerX - node.x;
                        const dy = centerY - node.y;
                        node.vx += dx * strength * alpha;
                        node.vy += dy * strength * alpha;
                    });
                }
            });
        };
    }

    ticked() {
        // Update link positions with proper arrow positioning
        this.linkElements.selectAll("path").attr("d", (d) => {
            const sourceNode = this.nodes.find((n) => n.id === d.source.id);
            const targetNode = this.nodes.find((n) => n.id === d.target.id);
            if (!sourceNode || !targetNode) return "";

            // Calculate the distance and angle
            const dx = targetNode.x - sourceNode.x;
            const dy = targetNode.y - sourceNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance === 0) return "";

            // Calculate node radii to position arrow correctly
            const sourceRadius = Math.max(
                8,
                Math.min(
                    20,
                    sourceNode.visitCount * 2 + sourceNode.entropy * 2,
                ),
            );
            const targetRadius = Math.max(
                8,
                Math.min(
                    20,
                    targetNode.visitCount * 2 + targetNode.entropy * 2,
                ),
            );

            // Adjust start and end points to node edges
            const startX = sourceNode.x + (dx / distance) * sourceRadius;
            const startY = sourceNode.y + (dy / distance) * sourceRadius;
            const endX = targetNode.x - (dx / distance) * (targetRadius + 8); // +8 for arrow
            const endY = targetNode.y - (dy / distance) * (targetRadius + 8);

            return `M${startX},${startY}L${endX},${endY}`;
        });

        // Update weight label positions
        this.linkElements.selectAll("text").attr("transform", (d) => {
            const sourceNode = this.nodes.find((n) => n.id === d.source.id);
            const targetNode = this.nodes.find((n) => n.id === d.target.id);
            if (!sourceNode || !targetNode) return "";

            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;

            return `translate(${midX},${midY})`;
        });

        // Update node positions
        this.nodeElements.attr("transform", (d) => `translate(${d.x},${d.y})`);

        // Update cluster hulls
        this.updateClusterHulls();
    }

    updateClusterHulls() {
        const hulls = [];

        this.clusters.forEach((cluster, clusterId) => {
            if (cluster.nodes.length > 2) {
                const points = cluster.nodes.map((d) => [d.x, d.y]);
                const hull = d3.polygonHull(points);
                if (hull) {
                    const centroid = d3.polygonCentroid(hull);
                    hulls.push({
                        cluster: clusterId,
                        hull: hull,
                        isActive: cluster.isActive,
                        firstUrl: cluster.firstUrl,
                        centroid: centroid,
                    });
                }
            }
        });

        const hullPaths = this.hullGroup
            .selectAll(".cluster-hull")
            .data(hulls, (d) => d.cluster);

        hullPaths.exit().remove();

        hullPaths
            .enter()
            .append("path")
            .attr(
                "class",
                (d) => `cluster-hull ${d.isActive ? "active" : "inactive"}`,
            )
            .merge(hullPaths)
            .attr("d", (d) => {
                const expanded = this.expandHull(d.hull, 25);
                return "M" + expanded.join("L") + "Z";
            });

        // Add cluster labels
        const clusterLabels = this.hullGroup
            .selectAll(".cluster-label")
            .data(hulls, (d) => d.cluster);

        clusterLabels.exit().remove();

        clusterLabels
            .enter()
            .append("text")
            .attr("class", "cluster-label")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#2d3436")
            .style("text-shadow", "1px 1px 2px rgba(255,255,255,0.8)")
            .style("pointer-events", "none")
            .merge(clusterLabels)
            .attr("x", (d) => d.centroid[0])
            .attr("y", (d) => d.centroid[1] - 30) // Position above centroid
            .text((d) => this.getClusterName(d.firstUrl));
    }

    expandHull(hull, padding) {
        const centroid = d3.polygonCentroid(hull);
        return hull.map((point) => {
            const dx = point[0] - centroid[0];
            const dy = point[1] - centroid[1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            const scale = (distance + padding) / distance;
            return [centroid[0] + dx * scale, centroid[1] + dy * scale];
        });
    }

    selectNode(node) {
        if (this.selectedNode) {
            this.selectedNode.selected = false;
        }
        this.selectedNode = node;
        node.selected = true;

        this.nodeElements.classed("selected", (d) => d.selected);
        this.linkElements.classed(
            "highlighted",
            (d) => d.source.id === node.id || d.target.id === node.id,
        );

        // Show tooltips for all connected nodes
        this.showConnectedNodeTooltips(node);
    }

    showConnectedNodeTooltips(selectedNode) {
        // Hide any existing tooltips first
        this.hideAllTooltips();

        // Find all connected nodes
        const connectedNodes = new Set();

        this.links.forEach((link) => {
            if (link.source.id === selectedNode.id) {
                connectedNodes.add(link.target);
            } else if (link.target.id === selectedNode.id) {
                connectedNodes.add(link.source);
            }
        });

        // Show tooltip for the selected node itself
        this.showPersistentTooltip(selectedNode, 0, true);

        // Show tooltips for all connected nodes
        let tooltipIndex = 1;
        connectedNodes.forEach((node) => {
            this.showPersistentTooltip(node, tooltipIndex, false);
            tooltipIndex++;
        });
    }

    showNodeTooltip(event, node) {
        const tooltip = document.getElementById("tooltip");
        const cleanedUrl = this.formatUrlForDisplay(node.url, {
            context: "tooltip",
            maxLength: 50,
        });
        const displayUrl =
            cleanedUrl.length > 50
                ? cleanedUrl.substring(0, 47) + "..."
                : cleanedUrl;

        let tooltipContent = `<strong>${node.domain}</strong><br><em>${displayUrl}</em><br>`;

        if (node.visitCount > 1) {
            // Show visit history for multiple visits
            tooltipContent += `<strong>Visit History (${node.visitCount} visits):</strong><br>`;

            // Show latest visit prominently
            tooltipContent += `<div style="background: rgba(66, 133, 244, 0.1); padding: 4px; border-radius: 3px; margin: 2px 0;">`;
            tooltipContent += `<strong>Latest:</strong> ${this.formatDwellTime(
                node.dwellTime,
            )} | `;
            tooltipContent += `Entropy: ${node.entropy.toFixed(2)} | `;
            tooltipContent += `Return: ${node.returnVelocity.toFixed(
                1,
            )}%</div>`;

            // Show summary statistics
            const totalDwellTime = node.dwellTimes.reduce(
                (sum, time) => sum + time,
                0,
            );
            const avgEntropy =
                node.entropies.reduce((sum, ent) => sum + ent, 0) /
                node.entropies.length;
            const avgReturn =
                node.returnVelocities.reduce((sum, ret) => sum + ret, 0) /
                node.returnVelocities.length;

            tooltipContent += `<strong>Total Time:</strong> ${this.formatDwellTime(
                totalDwellTime,
            )}<br>`;
            tooltipContent += `<strong>Avg Entropy:</strong> ${avgEntropy.toFixed(
                2,
            )}<br>`;
            tooltipContent += `<strong>Avg Return:</strong> ${avgReturn.toFixed(
                1,
            )}%`;
        } else {
            // Single visit - show normal metrics
            tooltipContent += `Dwell: ${this.formatDwellTime(
                node.dwellTime,
            )}<br>`;
            tooltipContent += `Entropy: ${node.entropy.toFixed(2)}<br>`;
            tooltipContent += `Return: ${node.returnVelocity.toFixed(1)}%`;
        }

        tooltip.innerHTML = tooltipContent;
        tooltip.style.left = event.pageX + 10 + "px";
        tooltip.style.top = event.pageY - 10 + "px";
        tooltip.classList.add("show");
    }

    showPersistentTooltip(node, index, isSelected = false) {
        // Create a unique tooltip element for this node
        let tooltip = document.getElementById(`tooltip-${node.id}`);
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = `tooltip-${node.id}`;
            tooltip.className = `tooltip persistent-tooltip ${
                isSelected ? "selected-tooltip" : "connected-tooltip"
            }`;
            document.body.appendChild(tooltip);

            // Add hover event listeners to bring tooltip to front
            tooltip.addEventListener("mouseenter", () => {
                tooltip.style.zIndex = "1010";
                tooltip.style.transform = isSelected
                    ? "scale(1.1)"
                    : "scale(1.05)";
                tooltip.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.4)";
            });

            tooltip.addEventListener("mouseleave", () => {
                tooltip.style.zIndex = isSelected ? "1001" : "1000";
                tooltip.style.transform = isSelected
                    ? "scale(1.05)"
                    : "scale(1)";
                tooltip.style.boxShadow = isSelected
                    ? "0 6px 24px rgba(66, 133, 244, 0.4)"
                    : "0 4px 16px rgba(0, 0, 0, 0.3)";
            });
        }

        const cleanedUrl = this.formatUrlForDisplay(node.url, {
            context: "tooltip",
            maxLength: 50,
        });
        const displayUrl =
            cleanedUrl.length > 50
                ? cleanedUrl.substring(0, 47) + "..."
                : cleanedUrl;

        let tooltipContent = `<strong>${node.domain}</strong><br><em>${displayUrl}</em><br>`;

        if (node.visitCount > 1) {
            tooltipContent += `<span style="color: #ff6b6b; font-weight: bold;">${node.visitCount} visits</span><br>`;
            const totalDwellTime = node.dwellTimes.reduce(
                (sum, time) => sum + time,
                0,
            );
            tooltipContent += `Total: ${this.formatDwellTime(
                totalDwellTime,
            )}<br>`;
            tooltipContent += `Latest: ${this.formatDwellTime(
                node.dwellTime,
            )}<br>`;
            tooltipContent += `Entropy: ${node.entropy.toFixed(2)}<br>`;
            tooltipContent += `Return: ${node.returnVelocity.toFixed(1)}%`;
        } else {
            tooltipContent += `Dwell: ${this.formatDwellTime(
                node.dwellTime,
            )}<br>`;
            tooltipContent += `Entropy: ${node.entropy.toFixed(2)}<br>`;
            tooltipContent += `Return: ${node.returnVelocity.toFixed(1)}%`;
        }

        tooltip.innerHTML = tooltipContent;

        // Position the tooltip near the actual node with a small offset
        const nodeRadius = Math.max(
            8,
            Math.min(20, node.visitCount * 2 + node.entropy * 2),
        );
        const offsetDistance = nodeRadius + 50;

        // Calculate position based on node's position
        const angle = isSelected ? 0 : index * ((Math.PI * 2) / 8);
        const offsetX = Math.cos(angle) * offsetDistance;
        const offsetY = Math.sin(angle) * offsetDistance;

        const tooltipX = Math.max(
            10,
            Math.min(window.innerWidth - 210, node.x + offsetX),
        );
        const tooltipY = Math.max(
            10,
            Math.min(window.innerHeight - 100, node.y + offsetY),
        );

        tooltip.style.left = tooltipX + "px";
        tooltip.style.top = tooltipY + "px";
        tooltip.style.position = "absolute";
        tooltip.style.zIndex = isSelected ? "1001" : "1000";
        tooltip.classList.add("show");
    }

    hideAllTooltips() {
        // Hide the main tooltip
        this.hideTooltip();

        // Remove all persistent tooltips
        document.querySelectorAll(".persistent-tooltip").forEach((tooltip) => {
            tooltip.remove();
        });
    }

    clearSelection() {
        if (this.selectedNode) {
            this.selectedNode.selected = false;
            this.selectedNode = null;
            this.nodeElements.classed("selected", (d) => false);
            this.linkElements.classed("highlighted", (d) => false);
            this.hideAllTooltips();
        }
    }

    showLinkTooltip(event, link) {
        const tooltip = document.getElementById("tooltip");
        const sourceNode = this.nodes.find((n) => n.id === link.source.id);
        const targetNode = this.nodes.find((n) => n.id === link.target.id);

        if (!sourceNode || !targetNode) return;

        const sourceDisplay = this.formatUrlForDisplay(sourceNode.url, {
            context: "tooltip",
            maxLength: 25,
        });
        const targetDisplay = this.formatUrlForDisplay(targetNode.url, {
            context: "tooltip",
            maxLength: 25,
        });

        let tooltipContent = `<strong>Navigation Path:</strong><br>`;
        tooltipContent += `${sourceDisplay}<br>`;
        tooltipContent += `&nbsp;&nbsp;↓<br>`;
        tooltipContent += `${targetDisplay}<br><br>`;

        if (link.weight > 1) {
            tooltipContent += `<strong>Traversed ${link.weight} times</strong><br>`;
            tooltipContent += `<em>Frequent navigation pattern</em>`;
        } else {
            tooltipContent += `<em>Single navigation</em>`;
        }

        tooltip.innerHTML = tooltipContent;
        tooltip.style.left = event.pageX + 10 + "px";
        tooltip.style.top = event.pageY - 10 + "px";
        tooltip.classList.add("show");
    }

    hideTooltip() {
        document.getElementById("tooltip").classList.remove("show");
    }

    exportGraph() {
        const svgElement = document.getElementById("graph");
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "linkx-browsing-graph.svg";
        a.click();
        URL.revokeObjectURL(url);
    }

    showEmptyState() {
        const container = this.svg.select(".graph-container");
        container
            .append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#636e72")
            .attr("font-size", "18px")
            .text(
                "No browsing data available. Open this graph from the extension popup.",
            );
    }

    showError(message) {
        console.error(message);

        const container = this.svg.select(".graph-container");
        container.selectAll("*").remove();

        container
            .append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height / 2 - 20)
            .attr("text-anchor", "middle")
            .attr("fill", "#ff6b6b")
            .attr("font-size", "18px")
            .text("❌ " + message);

        container
            .append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height / 2 + 20)
            .attr("text-anchor", "middle")
            .attr("fill", "#636e72")
            .attr("font-size", "14px")
            .text("Please open the graph from the extension popup");
    }

    handleResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.svg.attr("width", this.width).attr("height", this.height);

        if (this.simulation) {
            this.simulation.force(
                "center",
                d3.forceCenter(this.width / 2, this.height / 2),
            );
            this.simulation.alpha(0.3).restart();
        }
    }

    // Drag handlers
    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    createEvolutionControls() {
        // Create controls container if it doesn't exist
        let controlsContainer = document.getElementById(
            "evolution-controls-main",
        );
        if (!controlsContainer) {
            controlsContainer = document.createElement("div");
            controlsContainer.id = "evolution-controls-main";
            controlsContainer.className = "evolution-controls-main";
            controlsContainer.style.cssText = `
                position: absolute;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 255, 255, 0.95);
                padding: 15px 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(10px);
                z-index: 1000;
                display: flex;
                gap: 15px;
                align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid rgba(255, 255, 255, 0.2);
            `;
            document.body.appendChild(controlsContainer);
        }

        controlsContainer.innerHTML = `
            <div style="display: flex; gap: 15px; align-items: center;">
                <h3 style="margin: 0; color: #2d3436; font-size: 16px; font-weight: 600;">Network Evolution</h3>
                <button class="btn evolution-play-btn" id="evolution-play-main" style="padding: 8px 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">▶ Play</button>
                <button class="btn evolution-pause-btn" id="evolution-pause-main" style="padding: 8px 12px; background: #ff6b6b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease; display: none;">⏸ Pause</button>
                <button class="btn evolution-reset-btn" id="evolution-reset-main" style="padding: 8px 12px; background: #636e72; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">⏮ Reset</button>
                <select id="evolution-speed-main" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; background: white; font-size: 14px;">
                    <option value="1000">0.5x</option>
                    <option value="500" selected>1x</option>
                    <option value="200">2.5x</option>
                    <option value="100">5x</option>
                    <option value="50">10x</option>
                    <option value="20">25x</option>
                </select>
                <div id="evolution-time-main" style="color: #636e72; font-size: 14px; min-width: 180px; text-align: center;">Ready to play...</div>
                <button id="evolution-close-btn" style="
                    width: 32px;
                    height: 32px;
                    background: rgba(255, 107, 107, 0.1);
                    border: 1px solid rgba(255, 107, 107, 0.3);
                    border-radius: 50%;
                    font-size: 16px;
                    font-weight: bold;
                    color: #ff6b6b;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: none;
                    align-items: center;
                    justify-content: center;
                " onmouseover="this.style.background='#ff6b6b'; this.style.color='white'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(255, 107, 107, 0.1)'; this.style.color='#ff6b6b'; this.style.transform='scale(1)'">✕</button>
            </div>
        `;

        // Add event listeners
        document
            .getElementById("evolution-play-main")
            .addEventListener("click", () => this.startMainEvolution());
        document
            .getElementById("evolution-pause-main")
            .addEventListener("click", () => this.pauseMainEvolution());
        document
            .getElementById("evolution-reset-main")
            .addEventListener("click", () => this.resetMainEvolution());
        document
            .getElementById("evolution-close-btn")
            .addEventListener("click", () => this.exitEvolutionMode());

        // Initialize evolution state but don't auto-start
        this.initializeEvolutionState();
    }

    initializeEvolutionState() {
        // Initialize evolution variables
        this.isInEvolutionMode = false;
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap = new Map();
        this.evolutionTime = 0;
        this.evolutionInterval = null;
        this.evolutionSpeed = 100;

        // Create evolution sequence
        this.createEvolutionSequence();
    }

    startMainEvolution() {
        if (this.evolutionInterval) return;

        // Enter evolution mode
        this.isInEvolutionMode = true;

        // Hide the main graph elements temporarily
        this.svg.select(".graph-container").style("opacity", 0);

        // Setup evolution in the main SVG
        this.setupMainEvolutionNetwork();

        // Start the animation
        document.getElementById("evolution-play-main").style.display = "none";
        document.getElementById("evolution-pause-main").style.display =
            "inline-block";

        this.evolutionSpeed = parseInt(
            document.getElementById("evolution-speed-main").value,
        );

        this.evolutionInterval = setInterval(() => {
            this.stepMainEvolution();
        }, this.evolutionSpeed);
    }

    pauseMainEvolution() {
        if (this.evolutionInterval) {
            clearInterval(this.evolutionInterval);
            this.evolutionInterval = null;
        }

        document.getElementById("evolution-play-main").style.display =
            "inline-block";
        document.getElementById("evolution-pause-main").style.display = "none";
    }

    resetMainEvolution() {
        this.pauseMainEvolution();

        // Clear evolution state
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap.clear();
        this.evolutionTime = 0;

        // Clear visual elements
        this.evolutionLinksGroup.selectAll("*").remove();
        this.evolutionNodesGroup.selectAll("*").remove();

        // Hide close button
        const closeButton = document.getElementById("evolution-close-btn");
        if (closeButton) {
            closeButton.style.display = "none";
        }

        // Update display
        document.getElementById("evolution-time-main").textContent =
            "Ready to play...";

        // Restart simulation
        this.evolutionSimulation.nodes(this.evolutionNodes);
        this.evolutionSimulation.force("link").links(this.evolutionLinks);
    }

    stepMainEvolution() {
        if (this.evolutionTime >= this.evolutionSequence.length) {
            this.pauseMainEvolution();
            document.getElementById("evolution-time-main").textContent =
                "Evolution complete!";

            // Show close button when animation is complete
            this.showCloseButton();
            return;
        }

        const event = this.evolutionSequence[this.evolutionTime];
        const eventDate = new Date(event.timestamp);

        document.getElementById(
            "evolution-time-main",
        ).textContent = `${eventDate.toLocaleDateString()} ${eventDate.toLocaleTimeString()}`;

        if (event.type === "node") {
            this.addEvolutionNode(event);
        } else if (event.type === "link") {
            this.addEvolutionLink(event);
        }

        this.evolutionTime++;
    }

    exitEvolutionMode() {
        this.isInEvolutionMode = false;

        // Clear evolution interval
        this.pauseMainEvolution();

        // Reset control panel state but keep it visible
        document.getElementById("evolution-play-main").style.display =
            "inline-block";
        document.getElementById("evolution-pause-main").style.display = "none";
        document.getElementById("evolution-close-btn").style.display = "none";
        document.getElementById("evolution-time-main").textContent =
            "Ready to play...";

        // Reset evolution state
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap.clear();
        this.evolutionTime = 0;

        // Clear evolution from main container
        const container = this.svg.select(".graph-container");
        container.style("opacity", 0);

        setTimeout(() => {
            // Recreate the original graph
            this.createGraph();
            container.transition().duration(500).style("opacity", 1);
        }, 300);
    }

    createEvolutionSequence() {
        this.evolutionSequence = [];

        if (!this.data || !this.data.sessions) return;

        // Collect all browsing events with timestamps
        this.data.sessions.forEach((session, sessionIndex) => {
            if (!session.domains || session.domains.length === 0) return;

            const clusterId = session.tabId;
            const clusterColor = this.getClusterColor(sessionIndex);

            session.domains.forEach((domain) => {
                (domain.urls || []).forEach((url, urlIndex) => {
                    // Create timestamp for each URL (simulated chronological order)
                    const timestamp =
                        session.lastUpdate -
                        (domain.urls.length - urlIndex) * 60000; // 1 min apart

                    this.evolutionSequence.push({
                        timestamp,
                        type: "node",
                        url,
                        domain: domain.domain,
                        clusterId,
                        clusterColor,
                        sessionIndex,
                    });
                });
            });
        });

        // Sort by timestamp
        this.evolutionSequence.sort((a, b) => a.timestamp - b.timestamp);

        // Add link events after nodes are created
        this.addLinkEvents();
    }

    addLinkEvents() {
        // Group by cluster to create sequential links
        const clusterNodes = new Map();
        const linkEvents = [];

        this.evolutionSequence.forEach((event, index) => {
            if (event.type === "node") {
                if (!clusterNodes.has(event.clusterId)) {
                    clusterNodes.set(event.clusterId, []);
                }
                clusterNodes
                    .get(event.clusterId)
                    .push({ ...event, sequenceIndex: index });
            }
        });

        // Create link events
        clusterNodes.forEach((nodes, clusterId) => {
            for (let i = 1; i < nodes.length; i++) {
                const sourceEvent = nodes[i - 1];
                const targetEvent = nodes[i];

                linkEvents.push({
                    timestamp: targetEvent.timestamp + 1000, // 1 second after node
                    type: "link",
                    source: sourceEvent,
                    target: targetEvent,
                    clusterId,
                });
            }
        });

        // Add all link events to the sequence
        this.evolutionSequence.push(...linkEvents);

        // Re-sort after adding links
        this.evolutionSequence.sort((a, b) => a.timestamp - b.timestamp);
    }

    addEvolutionNode(event) {
        const nodeId = `${event.clusterId}-${event.url}`;

        if (this.evolutionNodeMap.has(nodeId)) return;

        const node = {
            id: nodeId,
            url: event.url,
            domain: event.domain,
            clusterId: event.clusterId,
            clusterColor: event.clusterColor,
            x: Math.random() * 400 + 100,
            y: Math.random() * 300 + 100,
        };

        this.evolutionNodes.push(node);
        this.evolutionNodeMap.set(nodeId, node);

        // Update the visual representation
        this.updateEvolutionVisuals();

        // Update simulation
        this.evolutionSimulation.nodes(this.evolutionNodes);
        this.evolutionSimulation.alpha(0.3).restart();
    }

    addEvolutionLink(event) {
        const sourceId = `${event.source.clusterId}-${event.source.url}`;
        const targetId = `${event.target.clusterId}-${event.target.url}`;

        const sourceNode = this.evolutionNodeMap.get(sourceId);
        const targetNode = this.evolutionNodeMap.get(targetId);

        if (!sourceNode || !targetNode) return;

        const link = {
            source: sourceNode,
            target: targetNode,
            type: "evolution-link",
        };

        this.evolutionLinks.push(link);

        // Update the visual representation
        this.updateEvolutionVisuals();

        // Update simulation
        this.evolutionSimulation.force("link").links(this.evolutionLinks);
        this.evolutionSimulation.alpha(0.3).restart();
    }

    updateEvolutionVisuals() {
        // Update nodes
        const nodeSelection = this.evolutionNodesGroup
            .selectAll(".evolution-node")
            .data(this.evolutionNodes, (d) => d.id);

        // Remove old nodes
        nodeSelection.exit().remove();

        // Add new nodes
        const nodeEnter = nodeSelection
            .enter()
            .append("g")
            .attr("class", "evolution-node")
            .on("dblclick", (event, d) => this.openNodeUrl(d));

        nodeEnter
            .append("circle")
            .attr("r", 0)
            .attr("fill", (d) => d.clusterColor)
            .attr("stroke", "#2d3436")
            .attr("stroke-width", 2)
            .attr("opacity", (d) => (d.isActive ? 0.9 : 0.6))
            .transition()
            .duration(500)
            .attr("r", 8);

        nodeEnter
            .append("text")
            .text((d) =>
                this.formatUrlForDisplay(d.url, {
                    context: "label",
                    maxLength: 12,
                    pathLength: 4,
                    queryLength: 6,
                }),
            )
            .attr("dy", 25)
            .attr("text-anchor", "middle")
            .style("font-size", "10px")
            .style("fill", "#2d3436")
            .style("opacity", 0)
            .transition()
            .delay(300)
            .duration(300)
            .style("opacity", 1);

        // Update links
        const linkSelection = this.evolutionLinksGroup
            .selectAll(".evolution-link")
            .data(this.evolutionLinks);

        // Remove old links
        linkSelection.exit().remove();

        // Add new links
        linkSelection
            .enter()
            .append("line")
            .attr("class", "evolution-link")
            .attr("stroke", "#4285f4")
            .attr("stroke-width", 2)
            .attr("opacity", 0)
            .transition()
            .duration(800)
            .attr("opacity", 0.6);
    }

    tickEvolution() {
        // Update node positions
        this.evolutionNodesGroup
            .selectAll(".evolution-node")
            .attr("transform", (d) => `translate(${d.x},${d.y})`);

        // Update link positions
        this.evolutionLinksGroup
            .selectAll(".evolution-link")
            .attr("x1", (d) => d.source.x)
            .attr("y1", (d) => d.source.y)
            .attr("x2", (d) => d.target.x)
            .attr("y2", (d) => d.target.y);
    }

    showCloseButton() {
        // Close button is now integrated into the control panel
        // Just show it when evolution is complete
        const closeButton = document.getElementById("evolution-close-btn");
        if (closeButton) {
            closeButton.style.display = "flex";
        }
    }

    setupMainEvolutionNetwork() {
        // Clear the main graph container
        const container = this.svg.select(".graph-container");
        container.selectAll("*").remove();

        // Initialize evolution state
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap = new Map();
        this.evolutionTime = 0;
        this.evolutionInterval = null;
        this.evolutionSpeed = 100; // Default to 0.1x speed (displayed as 1x)

        // Create groups for evolution in main container
        this.evolutionLinksGroup = container
            .append("g")
            .attr("class", "evolution-links");
        this.evolutionNodesGroup = container
            .append("g")
            .attr("class", "evolution-nodes");

        // Create chronological sequence
        this.createEvolutionSequence();

        // Setup force simulation for main evolution
        this.setupMainEvolutionSimulation();

        // Show the container again with evolution content
        container.transition().duration(500).style("opacity", 1);
    }

    setupMainEvolutionSimulation() {
        this.evolutionSimulation = d3
            .forceSimulation()
            .force(
                "link",
                d3
                    .forceLink()
                    .id((d) => d.id)
                    .distance(80)
                    .strength(0.6),
            )
            .force("charge", d3.forceManyBody().strength(-300).distanceMax(150))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide().radius(25))
            .on("tick", () => this.tickEvolution());
    }

    // Utility function to format dwell time consistently
    formatDwellTime(seconds) {
        if (seconds >= 60) {
            const minutes = seconds / 60;
            return minutes >= 10
                ? `${minutes.toFixed(0)}m`
                : `${minutes.toFixed(1)}m`;
        }
        return `${seconds.toFixed(1)}s`;
    }

    // Unified URL formatting function for consistent display across the app
    formatUrlForDisplay(url, options = {}) {
        if (!url) return options.fallback || "Unknown";

        const {
            maxLength = 50,
            pathLength = 5,
            queryLength = 8,
            showPath = true,
            showQuery = true,
            context = "general", // 'tooltip', 'label', 'cluster'
        } = options;

        try {
            const urlObj = new URL(url);
            let hostname = urlObj.hostname.toLowerCase();

            // Remove www. prefix for consistency
            if (hostname.startsWith("www.")) {
                hostname = hostname.substring(4);
            }

            // Special handling for Google search URLs
            if (hostname.includes("google.com") && showQuery) {
                const searchParams = new URLSearchParams(urlObj.search);
                const query = searchParams.get("q");
                if (query) {
                    // Clean up the search term
                    const cleanQuery = query
                        .replace(/[^a-zA-Z0-9\s]/g, "")
                        .replace(/\s+/g, "");

                    const truncatedQuery =
                        cleanQuery.length > queryLength
                            ? cleanQuery.substring(0, queryLength) + "..."
                            : cleanQuery;

                    const result = `${hostname}/${truncatedQuery}`;
                    return result.length > maxLength
                        ? result.substring(0, maxLength) + "..."
                        : result;
                }
                return hostname;
            }

            // Handle paths for non-Google URLs
            if (showPath) {
                let path = urlObj.pathname;
                if (path && path !== "/" && path.length > 1) {
                    // Remove leading slash
                    path = path.substring(1);

                    if (context === "tooltip") {
                        // For tooltips, show more of the path
                        const result = hostname + "/" + path;
                        return result.length > maxLength
                            ? result.substring(0, maxLength) + "..."
                            : result;
                    } else {
                        // For labels, truncate path
                        const truncatedPath =
                            path.length > pathLength
                                ? path.substring(0, pathLength) + "..."
                                : path;

                        const result = `${hostname}/${truncatedPath}`;
                        return result.length > maxLength
                            ? result.substring(0, maxLength) + "..."
                            : result;
                    }
                }
            }

            // Just domain if no meaningful path
            return hostname.length > maxLength
                ? hostname.substring(0, maxLength) + "..."
                : hostname;
        } catch (e) {
            // Fallback for invalid URLs
            let domain = url.split("/")[2] || url.split("/")[0] || url;

            // Remove www. from fallback as well
            if (domain && domain.startsWith("www.")) {
                domain = domain.substring(4);
            }

            const cleaned = domain || url.replace(/^https?:\/\/(www\.)?/, "");
            return cleaned.length > maxLength
                ? cleaned.substring(0, maxLength) + "..."
                : cleaned;
        }
    }

    openNodeUrl(node) {
        if (!node.url) {
            console.warn("No URL found for node:", node);
            return;
        }

        // Use the original URL, not the formatted display version
        const url = node.url;

        // Ensure URL has protocol for proper opening
        const fullUrl = url.startsWith("http") ? url : `https://${url}`;

        try {
            // Open in new tab using Chrome extension API
            chrome.tabs.create({ url: fullUrl });
        } catch (error) {
            // Fallback for non-extension environments
            console.warn(
                "Chrome extension API not available, using window.open",
            );
            window.open(fullUrl, "_blank");
        }
    }
}

// Initialize the graph when the page loads
document.addEventListener("DOMContentLoaded", () => {
    new BrowsingGraphVisualizer();
});
