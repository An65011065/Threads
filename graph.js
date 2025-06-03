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

        // Add click handler for link evolution
        document
            .querySelector(".link-evolution")
            .addEventListener("click", () => this.showTimelineView());
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

        // Process sessions into nodes and links
        data.sessions.forEach((session, sessionIndex) => {
            if (!session.domains || session.domains.length === 0) return;

            const clusterId = session.tabId;
            const clusterColor = this.getClusterColor(sessionIndex);

            this.clusters.set(clusterId, {
                id: clusterId,
                sessionId: session.sessionId,
                isActive: session.isActive,
                color: clusterColor,
                nodes: [],
                firstUrl: null,
            });

            let previousNode = null;

            session.domains.forEach((domain) => {
                (domain.urls || []).forEach((url) => {
                    const nodeKey = `${clusterId}-${url}`;
                    if (!nodeMap.has(nodeKey)) {
                        const node = {
                            id: nodeId++,
                            url: url,
                            domain: domain.domain,
                            visitCount: 1,
                            tabId: clusterId,
                            sessionId: session.sessionId,
                            isActive: session.isActive,
                            cluster: clusterId,
                            clusterColor: clusterColor,
                            dwellTime: this.calculateDwellTime(url, domain),
                            entropy: this.calculatePageEntropy(url, domain),
                            returnVelocity: this.calculateReturnVelocity(
                                url,
                                domain,
                            ),
                            x: this.width / 2 + (Math.random() - 0.5) * 100,
                            y: this.height / 2 + (Math.random() - 0.5) * 100,
                        };
                        this.nodes.push(node);
                        nodeMap.set(nodeKey, node);
                        this.clusters.get(clusterId).nodes.push(node);

                        if (!this.clusters.get(clusterId).firstUrl) {
                            this.clusters.get(clusterId).firstUrl = url;
                        }
                    }

                    const currentNode = nodeMap.get(nodeKey);

                    if (
                        previousNode &&
                        previousNode.tabId === currentNode.tabId
                    ) {
                        this.links.push({
                            source: previousNode.id,
                            target: currentNode.id,
                            type: "intra-tab",
                            tabId: clusterId,
                        });
                    }

                    previousNode = currentNode;
                });
            });
        });

        console.log(
            `📊 Processed: ${this.nodes.length} nodes, ${this.links.length} links, ${this.clusters.size} clusters`,
        );
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

        // Calculate network averages
        this.networkMetrics.avgDwellTime =
            this.nodes.reduce((sum, node) => sum + node.dwellTime, 0) /
            this.nodes.length;
        this.networkMetrics.avgPageEntropy =
            this.nodes.reduce((sum, node) => sum + node.entropy, 0) /
            this.nodes.length;
        this.networkMetrics.avgReturnVelocity =
            this.nodes.reduce((sum, node) => sum + node.returnVelocity, 0) /
            this.nodes.length;
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
            document.getElementById(
                "dwellTime",
            ).textContent = `${metrics.dwellTime.toFixed(1)}s`;
            document.getElementById("pageEntropy").textContent =
                metrics.entropy.toFixed(2);
            document.getElementById(
                "returnVelocity",
            ).textContent = `${metrics.returnVelocity.toFixed(1)}%`;
        } else {
            document.getElementById(
                "dwellTime",
            ).textContent = `${metrics.avgDwellTime.toFixed(1)}s`;
            document.getElementById("pageEntropy").textContent =
                metrics.avgPageEntropy.toFixed(2);
            document.getElementById(
                "returnVelocity",
            ).textContent = `${metrics.avgReturnVelocity.toFixed(1)}%`;
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
            .append("path")
            .attr("class", (d) => `link ${d.type}`)
            .on("mouseover", (event, d) => this.showLinkTooltip(event, d))
            .on("mouseout", () => this.hideTooltip());
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
            .on("mouseover", (event, d) => this.handleNodeHover(event, d))
            .on("mouseout", () => this.handleNodeOut());

        // Add circles to nodes
        this.nodeElements
            .append("circle")
            .attr("r", (d) =>
                Math.max(6, Math.min(18, d.visitCount * 3 + d.entropy * 2)),
            )
            .attr("fill", (d) => d.clusterColor)
            .attr("opacity", (d) => (d.isActive ? 0.9 : 0.6));

        // Add labels to nodes (hidden by default)
        this.nodeElements
            .append("text")
            .text((d) => this.getNodeLabel(d))
            .attr(
                "dy",
                (d) =>
                    Math.max(
                        6,
                        Math.min(18, d.visitCount * 3 + d.entropy * 2),
                    ) + 20,
            )
            .style("display", "none");
    }

    getNodeLabel(node) {
        return node.domain.length > 15
            ? node.domain.substring(0, 15) + "..."
            : node.domain;
    }

    getClusterName(url) {
        if (!url) return "Unknown";

        try {
            const urlObj = new URL(url);
            let name = urlObj.hostname;

            // Remove www. prefix
            if (name.startsWith("www.")) {
                name = name.substring(4);
            }

            // Truncate long domain names
            if (name.length > 20) {
                name = name.substring(0, 17) + "...";
            }

            return name;
        } catch (e) {
            // Fallback for invalid URLs
            const domain = url.split("/")[2] || url.split("/")[0];
            return domain.length > 20
                ? domain.substring(0, 17) + "..."
                : domain;
        }
    }

    cleanUrl(url) {
        if (!url) return url;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // Clean Google search URLs only
            if (hostname.includes("google.com")) {
                const searchParams = new URLSearchParams(urlObj.search);
                const query = searchParams.get("q");
                if (query) {
                    // Clean up the search term - remove special characters and spaces
                    const cleanQuery = query
                        .replace(/[^a-zA-Z0-9\s]/g, "")
                        .replace(/\s+/g, "");
                    return `google.com/${cleanQuery}`;
                }
                return "google.com";
            }

            // For all other URLs (including YouTube and X), return the original
            return url;
        } catch (e) {
            // If URL parsing fails, return original
            return url;
        }
    }

    handleNodeHover(event, node) {
        // Update URL display box with cluster's first URL
        const cluster = this.clusters.get(node.tabId);
        const clusterFirstUrl = cluster
            ? this.cleanUrl(cluster.firstUrl)
            : "unknown";
        document.getElementById(
            "clusterInfo",
        ).textContent = `tab cluster: ${clusterFirstUrl}`;

        const cleanedUrl = this.cleanUrl(node.url);
        document.getElementById("urlInfo").textContent = cleanedUrl;

        // Update metrics to show node-specific values
        this.updateMetricsDisplay(node);

        // Show tooltip
        this.showNodeTooltip(event, node);
    }

    handleNodeOut() {
        // Reset URL display box
        document.getElementById("clusterInfo").textContent = "tab cluster:";
        document.getElementById("urlInfo").textContent =
            "Hover over a node to see details";

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
                    .distance(80)
                    .strength(0.6),
            )
            .force("charge", d3.forceManyBody().strength(-400).distanceMax(200))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force(
                "collision",
                d3
                    .forceCollide()
                    .radius(
                        (d) =>
                            Math.max(
                                10,
                                Math.min(25, d.visitCount * 3 + d.entropy * 2),
                            ) + 5,
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
        // Update link positions
        this.linkElements.attr("d", (d) => {
            const sourceNode = this.nodes.find((n) => n.id === d.source.id);
            const targetNode = this.nodes.find((n) => n.id === d.target.id);
            if (!sourceNode || !targetNode) return "";
            return `M${sourceNode.x},${sourceNode.y}L${targetNode.x},${targetNode.y}`;
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
                tooltip.style.zIndex = "1010"; // Highest z-index when hovered
                tooltip.style.transform = isSelected
                    ? "scale(1.1)"
                    : "scale(1.05)";
                tooltip.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.4)";
            });

            tooltip.addEventListener("mouseleave", () => {
                tooltip.style.zIndex = isSelected ? "1001" : "1000"; // Reset to original z-index
                tooltip.style.transform = isSelected
                    ? "scale(1.05)"
                    : "scale(1)";
                tooltip.style.boxShadow = isSelected
                    ? "0 6px 24px rgba(66, 133, 244, 0.4)"
                    : "0 4px 16px rgba(0, 0, 0, 0.3)";
            });
        }

        const cleanedUrl = this.cleanUrl(node.url);
        const displayUrl =
            cleanedUrl.length > 50
                ? cleanedUrl.substring(0, 47) + "..."
                : cleanedUrl;

        tooltip.innerHTML = `
            <strong>${node.domain}</strong><br>
            <em>${displayUrl}</em><br>
            Dwell: ${node.dwellTime.toFixed(1)}s<br>
            Entropy: ${node.entropy.toFixed(2)}<br>
            Return: ${node.returnVelocity.toFixed(1)}%
        `;

        // Position the tooltip near the actual node with a small offset
        const nodeRadius = Math.max(
            6,
            Math.min(18, node.visitCount * 3 + node.entropy * 2),
        );
        const offsetDistance = nodeRadius + 50; // Distance from node center

        // Calculate position based on node's position
        // Use different angles to spread tooltips around nodes
        const angle = isSelected ? 0 : index * ((Math.PI * 2) / 8); // Spread in circle for connected nodes
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

    showNodeTooltip(event, node) {
        const tooltip = document.getElementById("tooltip");
        const cleanedUrl = this.cleanUrl(node.url);
        const displayUrl =
            cleanedUrl.length > 50
                ? cleanedUrl.substring(0, 47) + "..."
                : cleanedUrl;

        tooltip.innerHTML = `
            <strong>${node.domain}</strong><br>
            <em>${displayUrl}</em><br>
            Dwell: ${node.dwellTime.toFixed(1)}s<br>
            Entropy: ${node.entropy.toFixed(2)}<br>
            Return: ${node.returnVelocity.toFixed(1)}%
        `;
        tooltip.style.left = event.pageX + 10 + "px";
        tooltip.style.top = event.pageY - 10 + "px";
        tooltip.classList.add("show");
    }

    showLinkTooltip(event, link) {
        const tooltip = document.getElementById("tooltip");
        const sourceNode = this.nodes.find((n) => n.id === link.source.id);
        const targetNode = this.nodes.find((n) => n.id === link.target.id);

        tooltip.innerHTML = `
            <strong>Navigation:</strong><br>
            ${sourceNode.domain} → ${targetNode.domain}<br>
            <em>${
                link.type === "intra-tab" ? "Within same tab" : "Between tabs"
            }</em>
        `;
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

    showTimelineView() {
        // Hide the main graph elements
        document.getElementById("graph-container").style.display = "none";
        document.querySelector(".url-display-box").style.display = "none";
        document.querySelector(".metrics-container").style.display = "none";

        // Create timeline container if it doesn't exist
        let timelineContainer = document.getElementById("timeline-container");
        if (!timelineContainer) {
            timelineContainer = document.createElement("div");
            timelineContainer.id = "timeline-container";
            timelineContainer.className = "timeline-container";
            document.querySelector(".container").appendChild(timelineContainer);
        }

        timelineContainer.style.display = "block";
        this.createTimelineView(timelineContainer);
    }

    createTimelineView(container) {
        const hourlyData = this.generateHourlyData();

        container.innerHTML = `
            <div class="timeline-header">
                <h2>Network Evolution - Last 24 Hours</h2>
                <button class="btn timeline-back-btn">← Back to Graph</button>
            </div>
            <div class="timeline-content">
                <div class="evolution-controls">
                    <button class="btn evolution-play-btn" id="evolution-play">▶ Play Evolution</button>
                    <button class="btn evolution-pause-btn" id="evolution-pause" style="display: none;">⏸ Pause</button>
                    <button class="btn evolution-reset-btn" id="evolution-reset">⏮ Reset</button>
                    <div class="evolution-speed">
                        <label>Speed: </label>
                        <select id="evolution-speed">
                            <option value="100">0.1x</option>
                            <option value="50">0.5x</option>
                            <option value="20" selected>1x</option>
                            <option value="10">2x</option>
                            <option value="5">5x</option>
                        </select>
                    </div>
                    <div class="evolution-time" id="evolution-time">Ready to play...</div>
                </div>
                <div class="evolution-network" id="evolution-network"></div>
                <div class="timeline-chart" id="timeline-chart"></div>
            </div>
        `;

        // Add back button functionality
        container
            .querySelector(".timeline-back-btn")
            .addEventListener("click", () => {
                this.hideTimelineView();
            });

        // Add evolution controls
        this.setupEvolutionControls();

        // Setup both views
        this.setupEvolutionNetwork();
        this.renderHourlyChart(hourlyData);
    }

    setupEvolutionControls() {
        document
            .getElementById("evolution-play")
            .addEventListener("click", () => {
                this.startEvolution();
            });

        document
            .getElementById("evolution-pause")
            .addEventListener("click", () => {
                this.pauseEvolution();
            });

        document
            .getElementById("evolution-reset")
            .addEventListener("click", () => {
                this.resetEvolution();
            });
    }

    setupEvolutionNetwork() {
        const container = d3.select("#evolution-network");
        const width = window.innerWidth - 100;
        const height = 500;

        // Clear previous network
        container.selectAll("*").remove();

        this.evolutionSvg = container
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("border", "1px solid #ddd")
            .style("border-radius", "8px")
            .style("background", "#f8f9fa");

        this.evolutionContainer = this.evolutionSvg
            .append("g")
            .attr("class", "evolution-container");

        // Initialize evolution state
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap = new Map();
        this.evolutionTime = 0;
        this.evolutionInterval = null;
        this.evolutionSpeed = 20; // ms per step

        // Create chronological sequence of browsing events
        this.createEvolutionSequence();

        // Setup force simulation for evolution
        this.setupEvolutionSimulation(width, height);
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

                // Insert link event right after target node
                this.evolutionSequence.splice(
                    targetEvent.sequenceIndex + 1,
                    0,
                    {
                        timestamp: targetEvent.timestamp + 1000, // 1 second after node
                        type: "link",
                        source: sourceEvent,
                        target: targetEvent,
                        clusterId,
                    },
                );
            }
        });

        // Re-sort after adding links
        this.evolutionSequence.sort((a, b) => a.timestamp - b.timestamp);
    }

    setupEvolutionSimulation(width, height) {
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
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(25))
            .on("tick", () => this.tickEvolution());
    }

    startEvolution() {
        if (this.evolutionInterval) return;

        document.getElementById("evolution-play").style.display = "none";
        document.getElementById("evolution-pause").style.display =
            "inline-block";

        this.evolutionSpeed = parseInt(
            document.getElementById("evolution-speed").value,
        );

        this.evolutionInterval = setInterval(() => {
            this.stepEvolution();
        }, this.evolutionSpeed);
    }

    pauseEvolution() {
        if (this.evolutionInterval) {
            clearInterval(this.evolutionInterval);
            this.evolutionInterval = null;
        }

        document.getElementById("evolution-play").style.display =
            "inline-block";
        document.getElementById("evolution-pause").style.display = "none";
    }

    resetEvolution() {
        this.pauseEvolution();

        // Clear evolution state
        this.evolutionNodes = [];
        this.evolutionLinks = [];
        this.evolutionNodeMap.clear();
        this.evolutionTime = 0;

        // Clear visual elements
        this.evolutionContainer.selectAll("*").remove();

        // Update display
        document.getElementById("evolution-time").textContent =
            "Ready to play...";

        // Restart simulation
        this.evolutionSimulation.nodes(this.evolutionNodes);
        this.evolutionSimulation.force("link").links(this.evolutionLinks);
    }

    stepEvolution() {
        if (this.evolutionTime >= this.evolutionSequence.length) {
            this.pauseEvolution();
            document.getElementById("evolution-time").textContent =
                "Evolution complete!";
            return;
        }

        const event = this.evolutionSequence[this.evolutionTime];
        const eventDate = new Date(event.timestamp);

        document.getElementById(
            "evolution-time",
        ).textContent = `${eventDate.toLocaleDateString()} ${eventDate.toLocaleTimeString()}`;

        if (event.type === "node") {
            this.addEvolutionNode(event);
        } else if (event.type === "link") {
            this.addEvolutionLink(event);
        }

        this.evolutionTime++;
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

        // Add visual node
        const nodeElement = this.evolutionContainer
            .append("g")
            .attr("class", "evolution-node")
            .attr("transform", `translate(${node.x},${node.y})`);

        nodeElement
            .append("circle")
            .attr("r", 0)
            .attr("fill", node.clusterColor)
            .attr("stroke", "#2d3436")
            .attr("stroke-width", 2)
            .transition()
            .duration(500)
            .attr("r", 8);

        nodeElement
            .append("text")
            .text(
                node.domain.length > 10
                    ? node.domain.substring(0, 10) + "..."
                    : node.domain,
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

        // Add visual link
        this.evolutionContainer
            .insert("line", ".evolution-node")
            .attr("class", "evolution-link")
            .attr("x1", sourceNode.x)
            .attr("y1", sourceNode.y)
            .attr("x2", sourceNode.x)
            .attr("y2", sourceNode.y)
            .attr("stroke", "#4285f4")
            .attr("stroke-width", 2)
            .attr("opacity", 0)
            .transition()
            .duration(800)
            .attr("x2", targetNode.x)
            .attr("y2", targetNode.y)
            .attr("opacity", 0.6);

        // Update simulation
        this.evolutionSimulation.force("link").links(this.evolutionLinks);
        this.evolutionSimulation.alpha(0.3).restart();
    }

    tickEvolution() {
        // Update node positions
        this.evolutionContainer
            .selectAll(".evolution-node")
            .attr("transform", (d) => `translate(${d.x},${d.y})`);

        // Update link positions
        this.evolutionContainer
            .selectAll(".evolution-link")
            .attr("x1", (d) => d.source.x)
            .attr("y1", (d) => d.source.y)
            .attr("x2", (d) => d.target.x)
            .attr("y2", (d) => d.target.y);
    }

    generateHourlyData() {
        const now = Date.now();
        const hourlyData = [];

        // Generate data for last 24 hours
        for (let i = 23; i >= 0; i--) {
            const hourStart = now - i * 60 * 60 * 1000;
            const hourEnd = hourStart + 60 * 60 * 1000;

            let urlCount = 0;
            let tabCount = 0;
            const domains = new Set();

            if (this.data && this.data.sessions) {
                this.data.sessions.forEach((session) => {
                    if (
                        session.lastUpdate >= hourStart &&
                        session.lastUpdate < hourEnd
                    ) {
                        tabCount++;
                        session.domains.forEach((domain) => {
                            domains.add(domain.domain);
                            urlCount += domain.urls ? domain.urls.length : 0;
                        });
                    }
                });
            }

            const date = new Date(hourStart);
            hourlyData.push({
                hour: hourStart,
                timeLabel: date.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
                urlCount,
                tabCount,
                domainCount: domains.size,
            });
        }

        return hourlyData;
    }

    renderHourlyChart(data) {
        const chartContainer = document.getElementById("timeline-chart");
        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const width = window.innerWidth - margin.left - margin.right - 100;
        const height = 400 - margin.top - margin.bottom;

        // Clear previous chart
        chartContainer.innerHTML = "";

        const svg = d3
            .select("#timeline-chart")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3
            .scaleLinear()
            .domain([0, data.length - 1])
            .range([0, width]);

        const yScale = d3
            .scaleLinear()
            .domain([
                0,
                d3.max(data, (d) =>
                    Math.max(d.urlCount, d.tabCount, d.domainCount),
                ),
            ])
            .range([height, 0]);

        // Lines
        const urlLine = d3
            .line()
            .x((d, i) => xScale(i))
            .y((d) => yScale(d.urlCount))
            .curve(d3.curveMonotoneX);

        const tabLine = d3
            .line()
            .x((d, i) => xScale(i))
            .y((d) => yScale(d.tabCount))
            .curve(d3.curveMonotoneX);

        const domainLine = d3
            .line()
            .x((d, i) => xScale(i))
            .y((d) => yScale(d.domainCount))
            .curve(d3.curveMonotoneX);

        // Add axes
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(
                d3
                    .axisBottom(xScale)
                    .tickFormat((d, i) => (data[d] ? data[d].timeLabel : "")),
            );

        g.append("g").call(d3.axisLeft(yScale));

        // Add lines
        g.append("path")
            .datum(data)
            .attr("class", "line url-line")
            .attr("d", urlLine)
            .style("fill", "none")
            .style("stroke", "#4285f4")
            .style("stroke-width", 3);

        g.append("path")
            .datum(data)
            .attr("class", "line tab-line")
            .attr("d", tabLine)
            .style("fill", "none")
            .style("stroke", "#ff6b6b")
            .style("stroke-width", 3);

        g.append("path")
            .datum(data)
            .attr("class", "line domain-line")
            .attr("d", domainLine)
            .style("fill", "none")
            .style("stroke", "#4ecdc4")
            .style("stroke-width", 3);

        // Add dots for data points
        g.selectAll(".url-dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "url-dot")
            .attr("cx", (d, i) => xScale(i))
            .attr("cy", (d) => yScale(d.urlCount))
            .attr("r", 4)
            .style("fill", "#4285f4");

        g.selectAll(".tab-dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "tab-dot")
            .attr("cx", (d, i) => xScale(i))
            .attr("cy", (d) => yScale(d.tabCount))
            .attr("r", 4)
            .style("fill", "#ff6b6b");

        g.selectAll(".domain-dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "domain-dot")
            .attr("cx", (d, i) => xScale(i))
            .attr("cy", (d) => yScale(d.domainCount))
            .attr("r", 4)
            .style("fill", "#4ecdc4");

        // Add legend
        const legend = svg
            .append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width - 150}, 20)`);

        const legendData = [
            { label: "URLs", color: "#4285f4" },
            { label: "Tabs", color: "#ff6b6b" },
            { label: "Domains", color: "#4ecdc4" },
        ];

        legend
            .selectAll(".legend-item")
            .data(legendData)
            .enter()
            .append("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(0, ${i * 25})`)
            .each(function (d) {
                d3.select(this)
                    .append("line")
                    .attr("x1", 0)
                    .attr("x2", 20)
                    .style("stroke", d.color)
                    .style("stroke-width", 3);

                d3.select(this)
                    .append("text")
                    .attr("x", 25)
                    .attr("y", 5)
                    .text(d.label)
                    .style("font-size", "14px")
                    .style("fill", "#2d3436");
            });

        // Add labels
        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - height / 2)
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("fill", "#2d3436")
            .text("Count");

        g.append("text")
            .attr(
                "transform",
                `translate(${width / 2}, ${height + margin.bottom - 10})`,
            )
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("fill", "#2d3436")
            .text("Time (24-hour format)");
    }

    hideTimelineView() {
        // Show the main graph elements
        document.getElementById("graph-container").style.display = "block";
        document.querySelector(".url-display-box").style.display = "block";
        document.querySelector(".metrics-container").style.display = "flex";

        // Hide timeline container
        const timelineContainer = document.getElementById("timeline-container");
        if (timelineContainer) {
            timelineContainer.style.display = "none";
        }
    }
}

// Initialize the graph when the page loads
document.addEventListener("DOMContentLoaded", () => {
    new BrowsingGraphVisualizer();
});
