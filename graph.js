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
            density: 0,
            domainDiversity: 0,
            navigationEfficiency: 0,
            clusteringCoefficient: 0,
            totalSessionTime: 0,
            // Advanced metrics for network science
            pageRank: new Map(),
            betweennessCentrality: new Map(),
            closenessCentrality: new Map(),
            eigenvectorCentrality: new Map(),
            degreeCentrality: new Map(),
            diameter: 0,
            radius: 0,
            assortativity: 0,
            smallWorldness: 0,
            burstiness: 0,
            temporalEfficiency: 0,
            sessionCoherence: 0,
            networkEntropy: 0,
            mutualInformation: 0,
            transferEntropy: 0,
        };

        this.init();
    }

    init() {
        this.setupSVG();
        this.setupControls();
        this.setupMetricsTooltips();
        this.setupSearchFunctionality();
        this.createCSVExportButton();
        this.setDefaultDateTime();

        // Add storage change listener for automatic updates
        this.setupStorageListener();

        // Handle window resize
        window.addEventListener("resize", () => this.handleResize());

        this.loadData();
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
        const exportBtn = document.getElementById("exportBtn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                this.exportGraph();
            });
        }

        // Initialize evolution controls as part of standard interface
        this.createEvolutionControls();
    }

    setupMetricsTooltips() {
        const tooltipDefinitions = {
            dwellTime: "How long you spend looking at each page.",
            pageEntropy:
                "Higher values = longer URLs with more path segments (like /category/subcategory/item/details). Lower values = shorter URLs (like /home).",
            returnVelocity:
                "Whether you've been to this exact page before. 0% = this is your first visit to this URL.",
            totalSessionTime:
                "Total time you've spent browsing across all your sessions.",
            socialTime:
                "Total time spent on social platforms like YouTube, X, Twitch, etc.",
            sessionFocus:
                "Measures how evenly your time is spread across different websites using the Gini coefficient. Shows if you focus deeply on few sites or browse many briefly.",
            domainDiversity: "How many different domains you visit.",
            navigationEfficiency:
                "Percentage of your clicks that stay within the same website versus jumping to different websites. Calculated as: same-domain links ÷ total links.",
            clusteringCoefficient:
                "Measures how much your pages form triangular connections - when pages you visit are also connected to each other, creating tight browsing clusters.",
        };

        Object.keys(tooltipDefinitions).forEach((metricId) => {
            const metricElement = document.getElementById(metricId);
            if (metricElement && metricElement.parentElement) {
                const labelElement =
                    metricElement.parentElement.querySelector(".metric-label");
                if (labelElement) {
                    this.addCustomTooltip(
                        labelElement,
                        tooltipDefinitions[metricId],
                    );
                }
            }
        });
    }

    addCustomTooltip(element, text) {
        element.addEventListener("mouseenter", (e) => {
            this.showCustomTooltip(e, text);
        });

        element.addEventListener("mouseleave", () => {
            this.hideCustomTooltip();
        });

        element.addEventListener("mousemove", (e) => {
            this.updateTooltipPosition(e);
        });
    }

    showCustomTooltip(event, text) {
        // Remove any existing custom tooltip
        this.hideCustomTooltip();

        const tooltip = document.createElement("div");
        tooltip.className = "custom-metric-tooltip";
        tooltip.textContent = text;
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            max-width: 250px;
            line-height: 1.4;
            z-index: 10001;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(tooltip);
        this.updateTooltipPosition(event);
    }

    updateTooltipPosition(event) {
        const tooltip = document.querySelector(".custom-metric-tooltip");
        if (tooltip) {
            const x = event.clientX + 10;
            const y = event.clientY - 10;

            // Make sure tooltip doesn't go off screen
            const rect = tooltip.getBoundingClientRect();
            const finalX = Math.min(x, window.innerWidth - rect.width - 10);
            const finalY = Math.max(10, y - rect.height);

            tooltip.style.left = finalX + "px";
            tooltip.style.top = finalY + "px";
        }
    }

    hideCustomTooltip() {
        const existingTooltip = document.querySelector(
            ".custom-metric-tooltip",
        );
        if (existingTooltip) {
            existingTooltip.remove();
        }
    }

    async loadData() {
        const loading = document.getElementById("loading");
        loading.classList.remove("hidden");

        try {
            console.log("📦 Loading graph data from storage...");

            let data = null;

            // First, try to load from Chrome storage (real data)
            try {
                if (typeof chrome !== "undefined" && chrome.storage) {
                    const result = await chrome.storage.local.get([
                        "graphData",
                    ]);
                    data = result.graphData;
                    console.log(
                        "📦 Graph received data from Chrome storage:",
                        data,
                    );

                    if (data && data.sessions && data.sessions.length > 0) {
                        console.log(
                            "✅ Using real browsing data from Chrome storage",
                        );
                        // Update UI to show real data indicator
                        this.updateDataSourceIndicator("real");
                    }
                }
            } catch (chromeError) {
                console.log("⚠️ Chrome storage not available:", chromeError);
            }

            if (!data || !data.sessions || data.sessions.length === 0) {
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

        // Process sessions into nodes and links using chronological URL sequence
        data.sessions.forEach((session, sessionIndex) => {
            if (!session.urlSequence || session.urlSequence.length === 0) {
                console.log(
                    `⚠️ Session ${sessionIndex} has no urlSequence, skipping`,
                );
                return;
            }

            console.log(`🐛 DEBUG: Session ${sessionIndex}:`, session);
            console.log(
                `🔄 Processing ${session.urlSequence.length} URLs in chronological order`,
            );

            const clusterId = session.tabId;
            const clusterColor = this.getClusterColor(sessionIndex);

            this.clusters.set(clusterId, {
                id: clusterId,
                sessionId: session.sessionId,
                isActive: session.isActive,
                color: clusterColor,
                nodes: [],
                firstUrl: null,
                urlSequence: session.urlSequence.map((item) => item.url), // Extract just URLs for compatibility
                totalTime: 0, // Track total time spent in this cluster
            });

            let previousNodeKey = null;

            // Process URLs in their actual chronological order
            session.urlSequence.forEach((urlItem, sequenceIndex) => {
                // Add safety checks for urlItem properties
                if (!urlItem || typeof urlItem !== "object") {
                    console.log(
                        `⚠️ Invalid urlItem at sequence ${sequenceIndex}:`,
                        urlItem,
                    );
                    return;
                }

                const { url, domain, timestamp } = urlItem;

                // Ensure we have at least url and domain
                if (!url) {
                    console.log(
                        `⚠️ Missing URL at sequence ${sequenceIndex}:`,
                        urlItem,
                    );
                    return;
                }

                const safeDomain = domain || "unknown-domain";
                const safeTimestamp = timestamp || Date.now();

                // Normalize URL to prevent duplicates from slight variations
                const normalizedUrl = this.normalizeUrl(url);
                const nodeKey = normalizedUrl; // Use just the normalized URL as key (global deduplication)

                console.log(
                    `🐛 DEBUG: Processing URL ${sequenceIndex + 1}/${
                        session.urlSequence.length
                    }: ${url} → ${normalizedUrl}`,
                );

                if (!nodeMap.has(nodeKey)) {
                    // Create new node for first visit to this URL
                    const node = {
                        id: nodeId++,
                        url: normalizedUrl,
                        domain: safeDomain,
                        visitCount: 1,
                        tabId: clusterId,
                        sessionId: session.sessionId,
                        isActive: session.isActive,
                        cluster: clusterId,
                        clusterColor: clusterColor,
                        // Store metrics as arrays for multiple visits
                        dwellTimes: [
                            this.calculateDwellTime(urlItem, safeDomain),
                        ],
                        entropies: [
                            this.calculatePageEntropy(
                                normalizedUrl,
                                safeDomain,
                            ),
                        ],
                        returnVelocities: [
                            this.calculateReturnVelocity(
                                normalizedUrl,
                                safeDomain,
                            ),
                        ],
                        visitTimestamps: [safeTimestamp],
                        visitSequence: [sequenceIndex], // Track when in sequence this URL was visited
                        visitingSessions: [clusterId], // Track which sessions visited this URL
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

                    // Add this node's dwell time to cluster total
                    this.clusters.get(clusterId).totalTime += node.dwellTime;

                    if (!this.clusters.get(clusterId).firstUrl) {
                        this.clusters.get(clusterId).firstUrl = normalizedUrl;
                    }

                    console.log(
                        `🆕 Created new node: ${nodeKey} (ID: ${node.id}) - Visit count: ${node.visitCount}`,
                    );
                } else {
                    // REVISIT: Add another visit to existing node
                    const existingNode = nodeMap.get(nodeKey);
                    const previousCount = existingNode.visitCount;
                    existingNode.visitCount++;
                    existingNode.dwellTimes.push(
                        this.calculateDwellTime(urlItem, safeDomain),
                    );
                    existingNode.entropies.push(
                        this.calculatePageEntropy(normalizedUrl, safeDomain),
                    );
                    existingNode.returnVelocities.push(
                        this.calculateReturnVelocity(normalizedUrl, safeDomain),
                    );
                    existingNode.visitTimestamps.push(safeTimestamp);
                    existingNode.visitSequence.push(sequenceIndex);

                    // Track that this session also visited this URL
                    if (!existingNode.visitingSessions.includes(clusterId)) {
                        existingNode.visitingSessions.push(clusterId);
                        this.clusters.get(clusterId).nodes.push(existingNode);

                        // Add this visit's dwell time to cluster total
                        this.clusters.get(clusterId).totalTime +=
                            existingNode.dwellTime;
                    } else {
                        // Same session revisiting - still add the dwell time for this visit
                        this.clusters.get(clusterId).totalTime +=
                            existingNode.dwellTime;
                    }

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
                        `🔄 Revisit detected: ${normalizedUrl} - Visit count: ${previousCount} → ${existingNode.visitCount} (Session: ${clusterId})`,
                    );
                }

                // Create links based on actual chronological browsing sequence
                if (previousNodeKey && previousNodeKey !== nodeKey) {
                    console.log(
                        `🔗 Creating link: ${previousNodeKey} → ${nodeKey}`,
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

        // Process inter-tab relationships to create cross-cluster connections
        this.processInterTabRelationships(data, nodeMap);

        // Log statistics about revisits and loops
        const revisitStats = this.nodes.filter((node) => node.visitCount > 1);
        const loopLinks = this.links.filter((link) => link.weight > 1);
        const interClusterLinks = this.links.filter(
            (link) => link.type === "inter-tab",
        );

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
        if (interClusterLinks.length > 0) {
            console.log(
                `🌉 ${interClusterLinks.length} inter-cluster links created from tab relationships`,
            );
        }

        // Log the actual URL sequence for debugging
        this.clusters.forEach((cluster, clusterId) => {
            if (cluster.urlSequence.length > 0) {
                const sequence = cluster.urlSequence
                    .slice(0, 10)
                    .map((url) => {
                        try {
                            return new URL(url).hostname;
                        } catch {
                            return url.split("/")[2] || url;
                        }
                    })
                    .join(" → ");

                console.log(
                    `📍 Cluster ${clusterId} REAL chronological sequence: ${sequence}${
                        cluster.urlSequence.length > 10 ? "..." : ""
                    }`,
                );
                console.log(
                    `⏱️ Cluster ${clusterId} total time: ${this.formatDwellTime(
                        cluster.totalTime,
                    )} (${cluster.nodes.length} nodes)`,
                );
            }
        });
    }

    processInterTabRelationships(data, nodeMap) {
        if (!data.tabRelationships || data.tabRelationships.length === 0) {
            console.log("📭 No inter-tab relationships to process");
            return;
        }

        console.log(
            `🌉 Processing ${data.tabRelationships.length} inter-tab relationships...`,
        );

        data.tabRelationships.forEach((relationship, index) => {
            const { openerUrl, targetUrl, parentTabId, childTabId } =
                relationship;

            if (!openerUrl || !targetUrl) {
                console.log(
                    `⚠️ Skipping incomplete relationship ${index}: missing URLs`,
                );
                return;
            }

            // Normalize URLs to match our node keys
            const normalizedOpenerUrl = this.normalizeUrl(openerUrl);
            const normalizedTargetUrl = this.normalizeUrl(targetUrl);

            // Find the corresponding nodes
            const sourceNode = nodeMap.get(normalizedOpenerUrl);
            const targetNode = nodeMap.get(normalizedTargetUrl);

            if (!sourceNode || !targetNode) {
                console.log(
                    `⚠️ Could not find nodes for inter-tab relationship:`,
                    {
                        openerUrl: normalizedOpenerUrl,
                        targetUrl: normalizedTargetUrl,
                        sourceFound: !!sourceNode,
                        targetFound: !!targetNode,
                    },
                );
                return;
            }

            // Check if this inter-tab link already exists
            const existingInterTabLink = this.links.find(
                (link) =>
                    link.source === sourceNode.id &&
                    link.target === targetNode.id &&
                    link.type === "inter-tab",
            );

            if (existingInterTabLink) {
                // Increase weight for repeated inter-tab navigation
                existingInterTabLink.weight =
                    (existingInterTabLink.weight || 1) + 1;
                existingInterTabLink.traversalCount =
                    (existingInterTabLink.traversalCount || 1) + 1;
                console.log(
                    `🌉 Inter-tab link weight increased: ${sourceNode.url} → ${targetNode.url} (weight: ${existingInterTabLink.weight})`,
                );
            } else {
                // Create new inter-tab link
                const interTabLink = {
                    source: sourceNode.id,
                    target: targetNode.id,
                    type: "inter-tab",
                    weight: 1,
                    traversalCount: 1,
                    sourceUrl: sourceNode.url,
                    targetUrl: targetNode.url,
                    parentTabId: parentTabId,
                    childTabId: childTabId,
                    timestamp: relationship.timestamp,
                };

                this.links.push(interTabLink);
                console.log(
                    `🌉 Created inter-tab link: ${sourceNode.url} (tab ${parentTabId}) → ${targetNode.url} (tab ${childTabId})`,
                );
            }
        });
    }

    calculateDwellTime(url, domain) {
        // Handle both object and string inputs
        const domainStr =
            typeof domain === "string" ? domain : domain?.domain || "unknown";

        if (!url || !domainStr) {
            return 0.1; // Minimum fallback for no data
        }

        // If this is called with urlItem object that has actual dwell time, use it
        if (typeof url === "object" && url.dwellTime && url.dwellTime > 0) {
            return url.dwellTime;
        }

        // If we have start/end times, calculate actual dwell time
        if (typeof url === "object" && url.startTime) {
            if (url.endTime) {
                return Math.max(0.1, (url.endTime - url.startTime) / 1000);
            } else {
                // For active pages, calculate time from start to now
                const now = Date.now();
                return Math.max(0.1, (now - url.startTime) / 1000);
            }
        }

        // If we only have a URL string and no timing data, return minimal time
        // This handles legacy data or edge cases
        return 0.1;
    }

    calculatePageEntropy(url, domain) {
        // Handle both object and string inputs
        const domainStr =
            typeof domain === "string" ? domain : domain?.domain || "unknown";

        if (!url || !domainStr) {
            return 1.0; // Default fallback
        }

        // Simulate entropy based on URL complexity and domain characteristics
        const urlComplexity = (url.length + url.split("/").length) / 20;
        const domainFactor = domainStr.length / 15;
        return Math.min(
            5,
            Math.max(0.1, urlComplexity + domainFactor + Math.random()),
        );
    }

    calculateReturnVelocity(url, domain) {
        // Handle both object and string inputs
        const domainStr =
            typeof domain === "string" ? domain : domain?.domain || "unknown";

        if (!url || !domainStr) {
            return 0; // Default fallback
        }

        const nodeVisits =
            this.domainData?.[domainStr]?.urls?.[url]?.visitTimestamps || [];
        return nodeVisits.length > 1 ? 100 : 0; // Simple: 100% if revisited, 0% if not
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
        this.calculateSocialTime();
        this.calculateSessionFocus();
        this.calculateDomainDiversity();
        this.calculateNavigationEfficiency();
        this.calculateClusteringCoefficient();

        // **CALCULATE ALL NEW ADVANCED METRICS**

        // Centrality metrics
        this.calculateCentralityMetrics();

        // Structural metrics
        this.calculateStructuralMetrics();

        // Temporal metrics
        this.calculateTemporalMetrics();

        // Information-theoretic metrics
        this.calculateInformationTheoreticMetrics();

        // Log some key insights for debugging
        console.log("🧠 Advanced Network Science Metrics Calculated:");
        console.log(
            `   📊 PageRank Top Node: ${this.getTopNodeByCentrality(
                "pageRank",
            )}`,
        );
        console.log(`   🌐 Network Diameter: ${this.networkMetrics.diameter}`);
        console.log(
            `   🔄 Small-worldness: ${this.networkMetrics.smallWorldness.toFixed(
                3,
            )}`,
        );
        console.log(
            `   ⚡ Burstiness: ${this.networkMetrics.burstiness.toFixed(3)}`,
        );
        console.log(
            `   🎯 Session Coherence: ${this.networkMetrics.sessionCoherence.toFixed(
                1,
            )}%`,
        );

        this.calculateTotalSessionTime();
    }

    calculateTotalSessionTime() {
        let totalTime = 0;

        if (!this.nodes || !Array.isArray(this.nodes)) {
            console.log(
                "⚠️ No nodes array found for total session time calculation",
            );
            this.networkMetrics.totalSessionTime = 0;
            return;
        }

        this.nodes.forEach((node) => {
            if (node && typeof node.dwellTime === "number") {
                totalTime += node.dwellTime;
            }
        });

        this.networkMetrics.totalSessionTime = totalTime;
        console.log(
            `📊 Total session time calculated: ${totalTime.toFixed(1)}s`,
        );
    }

    calculateSocialTime() {
        // Define social media and entertainment platforms
        const socialDomains = [
            "youtube.com",
            "youtu.be",
            "facebook.com",
            "fb.com",
            "m.facebook.com",
            "instagram.com",
            "m.instagram.com",
            "x.com",
            "twitter.com",
            "mobile.twitter.com",
            "snapchat.com",
            "netflix.com",
            "tiktok.com",
            "m.tiktok.com",
            "linkedin.com",
            "m.linkedin.com",
            "reddit.com",
            "m.reddit.com",
            "old.reddit.com",
            "discord.com",
            "discordapp.com",
            "twitch.tv",
            "m.twitch.tv",
            "pinterest.com",
            "m.pinterest.com",
            "tumblr.com",
            "whatsapp.com",
            "web.whatsapp.com",
            "telegram.org",
            "web.telegram.org",
            "hulu.com",
            "disneyplus.com",
            "amazon.com/prime",
            "primevideo.com",
            "hbomax.com",
            "spotify.com",
            "open.spotify.com",
            "soundcloud.com",
        ];

        let socialTime = 0;

        this.nodes.forEach((node) => {
            if (!node.domain || !node.dwellTime) return;

            const domain = node.domain.toLowerCase();

            // Check if this domain matches any social platform
            const isSocial = socialDomains.some((socialDomain) => {
                // Handle exact matches and subdomain matches
                return (
                    domain === socialDomain ||
                    domain.endsWith("." + socialDomain) ||
                    (socialDomain.includes("/") &&
                        domain.includes(socialDomain.split("/")[0]))
                );
            });

            if (isSocial) {
                socialTime += node.dwellTime;
            }
        });

        this.networkMetrics.socialTime = socialTime;
        console.log(
            `📱 Social time calculated: ${socialTime.toFixed(
                1,
            )}s across social platforms`,
        );
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
                if (session.lastUpdate >= oneDayAgo && session.urlSequence) {
                    urlsLast24h += session.urlSequence.length;
                }
            });
        }

        document.getElementById("urlCount").textContent = `${urlsLast24h} urls`;
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

            // Show total session time (always network-wide)
            document.getElementById("totalSessionTime").textContent =
                this.formatDwellTime(this.networkMetrics.totalSessionTime);

            // For individual nodes, show network averages for the network science metrics
            document.getElementById("socialTime").textContent =
                this.formatDwellTime(this.networkMetrics.socialTime);
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
        } else {
            // Show network-wide metrics
            document.getElementById("dwellTime").textContent =
                this.formatDwellTime(metrics.avgDwellTime);
            document.getElementById("pageEntropy").textContent =
                metrics.avgPageEntropy.toFixed(2);
            document.getElementById(
                "returnVelocity",
            ).textContent = `${metrics.avgReturnVelocity.toFixed(1)}%`;

            // Show total session time
            document.getElementById("totalSessionTime").textContent =
                this.formatDwellTime(metrics.totalSessionTime);

            // Network science metrics
            document.getElementById("socialTime").textContent =
                this.formatDwellTime(metrics.socialTime);
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
            ).textContent = `${this.networkMetrics.clusteringCoefficient.toFixed(
                1,
            )}%`;
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

        // Create links
        this.createLinks(container);

        // Create nodes
        this.createNodes(container);

        // Create cluster hulls (after nodes so labels appear on top)
        this.createClusterHulls(container);

        // Setup force simulation
        this.setupForceSimulation();
    }

    createClusterHulls(container) {
        this.hullGroup = container
            .append("g")
            .attr("class", "hulls")
            .style("z-index", "1000");
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
                if (d.type === "inter-tab") {
                    return d.weight > 1 ? "#e74c3c" : "#9b59b6"; // Purple/red for inter-tab links
                }
                if (d.weight > 3) return "#ff6b6b"; // Heavy traffic - red
                if (d.weight > 1) return "#feca57"; // Repeated path - yellow
                return "#4285f4"; // Single traversal - blue
            })
            .attr("stroke-width", (d) => {
                if (d.type === "inter-tab") {
                    return Math.min(10, 3 + d.weight * 1.5); // Thicker for inter-tab
                }
                return Math.min(8, 1 + d.weight);
            })
            .attr("opacity", (d) => {
                if (d.type === "inter-tab") {
                    return Math.min(0.95, 0.7 + d.weight * 0.1); // More visible for inter-tab
                }
                return Math.min(0.9, 0.4 + d.weight * 0.1);
            })
            .attr("fill", "none")
            .attr("marker-end", "url(#arrowhead)")
            .attr("stroke-dasharray", (d) => {
                return d.type === "inter-tab" ? "8,4" : "none"; // Dashed for inter-tab links
            })
            .on("mouseover", (event, d) => this.showLinkTooltip(event, d))
            .on("mouseout", () => this.hideTooltip());

        // Add arrowhead marker definition to SVG
        this.svg
            .append("defs")
            .append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "0 -3 6 6")
            .attr("refX", 5)
            .attr("refY", 0)
            .attr("markerWidth", 4)
            .attr("markerHeight", 4)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-3L6,0L0,3")
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
            let clusterInfo = `<div style="font-weight: bold; margin-bottom: 8px; color: black;">Tab Cluster Details:</div>`;

            sortedNodes.forEach((clusterNode, index) => {
                const displayUrl = this.formatUrlForDisplay(clusterNode.url, {
                    context: "tooltip",
                    maxLength: 35,
                });

                // Only highlight the first URL found with maximum time
                const isHighest = index === maxTimeIndex;
                const style = isHighest
                    ? "background: rgba(255, 255, 255, 0.2); border-left: 3px solid white; padding: 2px 6px; margin: 1px 0; border-radius: 3px; font-weight: 500;"
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
                        ? ` <span style="color: #666666; font-weight: bold;">(${clusterNode.visitCount}×)</span>`
                        : "";

                clusterInfo += `<div style="${style}">
                    <div style="font-size: 12px; color: black;">${displayUrl}${visitIndicator}</div>
                    <div style="font-size: 10px; color: #444444;">${this.formatDwellTime(
                        displayTime,
                    )}</div>
                </div>`;
            });

            // Add total time
            clusterInfo += `<div style="border-top: 1px solid rgba(0, 0, 0, 0.2); margin-top: 8px; padding-top: 6px; font-weight: bold; color: black;">
                Total Time: ${this.formatDwellTime(totalTime)}
            </div>`;

            document.getElementById("clusterInfo").innerHTML = clusterInfo;
        } else {
            document.getElementById("clusterInfo").innerHTML =
                '<div style="color: black;">Tab cluster: Unknown</div>';
        }

        // Update metrics to show node-specific values (no individual URL info needed)
        this.updateMetricsDisplay(node);

        // Show tooltip
        this.showNodeTooltip(event, node);
    }

    handleNodeOut() {
        // Reset cluster display box
        this.updateDataSourceIndicator("real");

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
                        totalTime: cluster.totalTime,
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
            .style("pointer-events", "none")
            .style("fill", (d) =>
                d.isActive
                    ? "rgba(66, 133, 244, 0.05)"
                    : "rgba(99, 110, 114, 0.03)",
            )
            .style("stroke", (d) =>
                d.isActive
                    ? "rgba(66, 133, 244, 0.3)"
                    : "rgba(99, 110, 114, 0.2)",
            )
            .style("stroke-width", (d) => (d.isActive ? "1.5px" : "1px"))
            .style("stroke-dasharray", "3,2")
            .style("opacity", (d) => (d.isActive ? 0.7 : 0.4))
            .merge(hullPaths)
            .attr("d", (d) => {
                const expanded = this.expandHull(d.hull, 25);
                return "M" + expanded.join("L") + "Z";
            })
            .style("fill", (d) =>
                d.isActive
                    ? "rgba(66, 133, 244, 0.05)"
                    : "rgba(99, 110, 114, 0.03)",
            )
            .style("stroke", (d) =>
                d.isActive
                    ? "rgba(66, 133, 244, 0.3)"
                    : "rgba(99, 110, 114, 0.2)",
            )
            .style("stroke-width", (d) => (d.isActive ? "1.5px" : "1px"))
            .style("stroke-dasharray", "3,2")
            .style("opacity", (d) => (d.isActive ? 0.7 : 0.4));

        // Add cluster labels
        const clusterLabels = this.hullGroup
            .selectAll(".cluster-label")
            .data(hulls, (d) => d.cluster);

        clusterLabels.exit().remove();

        const clusterLabelGroups = clusterLabels
            .enter()
            .append("g")
            .attr("class", "cluster-label")
            .style("z-index", "1000")
            .style("pointer-events", "none")
            .merge(clusterLabels)
            .attr(
                "transform",
                (d) => `translate(${d.centroid[0]}, ${d.centroid[1] - 30})`,
            );

        // Remove old elements
        clusterLabelGroups.selectAll("*").remove();

        // Add simple yellow highlighter background
        clusterLabelGroups
            .append("rect")
            .attr("class", "cluster-time-highlight")
            .attr("x", -25)
            .attr("y", -8)
            .attr("width", 50)
            .attr("height", 16)
            .attr("rx", 3)
            .attr("ry", 3)
            .style("fill", "rgba(255, 255, 0, 0.6)")
            .style("stroke", "none");

        // Add the time text on top
        clusterLabelGroups
            .append("text")
            .attr("class", "cluster-time-text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#2d3436")
            .style("pointer-events", "none")
            .text((d) => {
                return this.formatDwellTime(d.totalTime || 0);
            });
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

        let tooltipContent = `<em>${displayUrl}</em><br>`;

        if (node.visitCount > 1) {
            // Show visit history for multiple visits
            tooltipContent += `<strong>Visit History (${node.visitCount} visits):</strong><br>`;

            // Show latest visit prominently
            tooltipContent += `<div style="background: rgba(66, 133, 244, 0.1); padding: 4px; border-radius: 3px; margin: 2px 0;">`;
            tooltipContent += `<strong>Latest:</strong> ${this.formatDwellTime(
                node.dwellTime,
            )}</div>`;

            // Show summary statistics
            const totalDwellTime = node.dwellTimes.reduce(
                (sum, time) => sum + time,
                0,
            );

            tooltipContent += `<strong>Total Time:</strong> ${this.formatDwellTime(
                totalDwellTime,
            )}`;
        } else {
            // Single visit - show normal metrics
            tooltipContent += `${this.formatDwellTime(node.dwellTime)}`;
        }

        // **ADD CENTRALITY METRICS TO TOOLTIP**
        const centralityInfo = this.getNodeCentralityInfo(node);

        tooltipContent += `<hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">`;
        tooltipContent += `<div style="font-size: 11px; color: #636e72;">`;
        tooltipContent += `<strong>Network Position:</strong><br>`;
        tooltipContent += `PageRank: ${(centralityInfo.pageRank * 1000).toFixed(
            2,
        )}<br>`;
        tooltipContent += `Betweenness: ${(
            centralityInfo.betweenness * 100
        ).toFixed(1)}%<br>`;
        tooltipContent += `Degree: ${(centralityInfo.degree * 100).toFixed(
            1,
        )}%<br>`;
        tooltipContent += `Closeness: ${(
            centralityInfo.closeness * 100
        ).toFixed(1)}%`;
        tooltipContent += `</div>`;

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

        let tooltipContent = `<em>${displayUrl}</em><br>`;

        if (node.visitCount > 1) {
            tooltipContent += `<span style="color: #ff6b6b; font-weight: bold;">${node.visitCount} visits</span><br>`;
            const totalDwellTime = node.dwellTimes.reduce(
                (sum, time) => sum + time,
                0,
            );
            tooltipContent += `Total: ${this.formatDwellTime(
                totalDwellTime,
            )}<br>`;
            tooltipContent += `Latest: ${this.formatDwellTime(node.dwellTime)}`;
        } else {
            tooltipContent += `${this.formatDwellTime(node.dwellTime)}`;
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

        let tooltipContent = "";

        if (link.type === "inter-tab") {
            // Inter-tab relationship tooltip
            tooltipContent += `<div style="background: rgba(155, 89, 182, 0.1); padding: 8px; border-radius: 4px; margin: 4px 0;">`;
            tooltipContent += `<strong>From:</strong> ${sourceDisplay}<br>`;
            tooltipContent += `<span style="color: #9b59b6; font-size: 12px;">Tab ${link.parentTabId}</span><br><br>`;
            tooltipContent += `<strong>Opened in new tab:</strong><br>`;
            tooltipContent += `${targetDisplay}<br>`;
            tooltipContent += `<span style="color: #9b59b6; font-size: 12px;">Tab ${link.childTabId}</span>`;
            tooltipContent += `</div>`;

            if (link.weight > 1) {
                tooltipContent += `<strong style="color: #e74c3c;">Opened ${link.weight} times</strong>`;
            }
        } else {
            // Regular navigation tooltip
            tooltipContent += `${sourceDisplay}<br>`;
            tooltipContent += `&nbsp;&nbsp;↓<br>`;
            tooltipContent += `${targetDisplay}<br><br>`;

            if (link.weight > 1) {
                tooltipContent += `<strong>Traversed ${link.weight} times</strong>`;
            }
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
            <div style="display: flex; gap: 15px; align-items: center;" id="evolution-controls-content">
                <div style="position: relative; display: flex; align-items: center;" id="search-container">
                    <button 
                        id="search-toggle-btn"
                        style="
                            padding: 8px 12px; 
                            background: #ff6b6b; 
                            color: white; 
                            border: none; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-size: 14px;
                            transition: all 0.2s ease;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            opacity: 1;
                        "
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="16" height="16" viewBox="0 0 72 72" style="fill: white;">
                            <path d="M 31 11 C 19.973 11 11 19.973 11 31 C 11 42.027 19.973 51 31 51 C 34.974166 51 38.672385 49.821569 41.789062 47.814453 L 54.726562 60.751953 C 56.390563 62.415953 59.088953 62.415953 60.751953 60.751953 C 62.415953 59.087953 62.415953 56.390563 60.751953 54.726562 L 47.814453 41.789062 C 49.821569 38.672385 51 34.974166 51 31 C 51 19.973 42.027 11 31 11 z M 31 19 C 37.616 19 43 24.384 43 31 C 43 37.616 37.616 43 31 43 C 24.384 43 19 37.616 19 31 C 19 24.384 24.384 19 31 19 z"></path>
                        </svg>
                    </button>
                    <div id="search-input-container" style="display: none; position: relative; opacity: 0; transition: opacity 0.2s ease;">
                        <input 
                            type="text" 
                            id="evolution-search" 
                            placeholder="search for a keyword or url"
                            style="
                                padding: 8px 12px; 
                                border: 1px solid #ddd; 
                                border-radius: 6px; 
                                background: white; 
                                font-size: 14px;
                                width: 200px;
                                transition: all 0.3s ease;
                                outline: none;
                            "
                        />
                    </div>
                </div>
                <div id="control-buttons" style="display: flex; gap: 15px; align-items: center; transition: opacity 0.2s ease; opacity: 1;">
                    <button class="btn evolution-play-btn" id="evolution-play-main" style="padding: 8px 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">▶</button>
                    <button class="btn evolution-pause-btn" id="evolution-pause-main" style="padding: 8px 12px; background: #ff6b6b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease; display: none;">⏸</button>
                    <button class="btn evolution-reset-btn" id="evolution-reset-main" style="padding: 8px 12px; background: #636e72; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">⏮</button>
                    <select id="evolution-speed-main" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; background: white; font-size: 14px;">
                        <option value="1000">0.5x</option>
                        <option value="500" selected>1x</option>
                        <option value="200">2.5x</option>
                        <option value="100">5x</option>
                        <option value="50">10x</option>
                        <option value="20">25x</option>
                    </select>
                    <div id="evolution-time-main" style="color: #636e72; font-size: 14px; min-width: 180px; text-align: center;"></div>
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
            </div>
        `;

        // Add event listeners for evolution controls
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

        // Add search functionality
        this.setupSearchFunctionality();

        // Set current date/time as default display
        setTimeout(() => {
            this.setDefaultDateTime();
        }, 100);
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

        // Collect all browsing events from urlSequence with timestamps
        this.data.sessions.forEach((session, sessionIndex) => {
            if (!session.urlSequence || session.urlSequence.length === 0)
                return;

            const clusterId = session.tabId;
            const clusterColor = this.getClusterColor(sessionIndex);

            // Use the actual urlSequence which already has timestamps and chronological order
            session.urlSequence.forEach((urlItem, urlIndex) => {
                this.evolutionSequence.push({
                    timestamp: urlItem.timestamp,
                    type: "node",
                    url: urlItem.url,
                    domain: urlItem.domain,
                    clusterId,
                    clusterColor,
                    sessionIndex,
                });
            });
        });

        // Sort by timestamp (should already be mostly sorted)
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

    // Normalize URLs to prevent duplicate nodes from slight variations
    normalizeUrl(url) {
        // Add safety check for undefined/null URLs
        if (!url || typeof url !== "string") {
            console.warn("Invalid URL provided to normalizeUrl:", url);
            return "invalid-url";
        }

        try {
            const urlObj = new URL(url);

            // Remove www. prefix
            let hostname = urlObj.hostname.toLowerCase();
            if (hostname.startsWith("www.")) {
                hostname = hostname.substring(4);
            }

            // Keep pathname as-is (important for different pages)
            let pathname = urlObj.pathname;
            // Only remove trailing slash if it's just the root path
            if (pathname === "/") {
                pathname = "";
            } else if (pathname.endsWith("/") && pathname.length > 1) {
                pathname = pathname.slice(0, -1);
            }

            // Keep search parameters but sort them for consistency
            // This is important for search queries, video IDs, etc.
            const searchParams = new URLSearchParams(urlObj.search);
            searchParams.sort();

            // Reconstruct normalized URL
            let normalizedUrl = `${urlObj.protocol}//${hostname}${pathname}`;
            if (searchParams.toString()) {
                normalizedUrl += `?${searchParams.toString()}`;
            }

            // Remove common tracking parameters that don't change content
            const trackingParams = [
                "utm_source",
                "utm_medium",
                "utm_campaign",
                "utm_content",
                "utm_term",
                "fbclid",
                "gclid",
            ];
            const cleanParams = new URLSearchParams();

            for (const [key, value] of searchParams) {
                if (!trackingParams.includes(key.toLowerCase())) {
                    cleanParams.append(key, value);
                }
            }

            // Rebuild final URL
            normalizedUrl = `${urlObj.protocol}//${hostname}${pathname}`;
            if (cleanParams.toString()) {
                normalizedUrl += `?${cleanParams.toString()}`;
            }

            return normalizedUrl;
        } catch (error) {
            // If URL parsing fails, return original URL or fallback
            console.warn("Failed to normalize URL:", url, error);
            return url || "invalid-url";
        }
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

    // **NEW ADVANCED NETWORK SCIENCE CALCULATION METHODS**

    calculateCentralityMetrics() {
        if (this.nodes.length === 0) return;

        // Calculate degree centrality
        this.calculateDegreeCentrality();

        // Calculate PageRank
        this.calculatePageRank();

        // Calculate betweenness centrality
        this.calculateBetweennessCentrality();

        // Calculate closeness centrality
        this.calculateClosenessCentrality();

        // Calculate eigenvector centrality
        this.calculateEigenvectorCentrality();

        // Calculate network centralization
        this.calculateNetworkCentralization();
    }

    calculateDegreeCentrality() {
        const adj = this.buildAdjacencyMap();
        const maxDegree = Math.max(
            ...Array.from(adj.values()).map((neighbors) => neighbors.size),
        );

        this.networkMetrics.degreeCentrality.clear();
        this.nodes.forEach((node) => {
            const degree = adj.get(node.id)?.size || 0;
            const centrality =
                this.nodes.length > 1 ? degree / (this.nodes.length - 1) : 0;
            this.networkMetrics.degreeCentrality.set(node.id, centrality);
        });
    }

    calculatePageRank(damping = 0.85, iterations = 100, epsilon = 1e-6) {
        const n = this.nodes.length;
        if (n === 0) return;

        // Initialize PageRank values
        const pr = new Map();
        this.nodes.forEach((node) => pr.set(node.id, 1.0 / n));

        // Build adjacency list with outgoing edges
        const outLinks = new Map();
        const inLinks = new Map();

        this.nodes.forEach((node) => {
            outLinks.set(node.id, []);
            inLinks.set(node.id, []);
        });

        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            outLinks.get(sourceId)?.push(targetId);
            inLinks.get(targetId)?.push(sourceId);
        });

        // Power iteration
        for (let iter = 0; iter < iterations; iter++) {
            const newPr = new Map();
            let maxChange = 0;

            this.nodes.forEach((node) => {
                let rank = (1 - damping) / n;

                inLinks.get(node.id)?.forEach((inNodeId) => {
                    const inNodeOutDegree = outLinks.get(inNodeId)?.length || 1;
                    rank += damping * (pr.get(inNodeId) / inNodeOutDegree);
                });

                newPr.set(node.id, rank);
                maxChange = Math.max(
                    maxChange,
                    Math.abs(rank - pr.get(node.id)),
                );
            });

            // Update PageRank values
            newPr.forEach((value, key) => pr.set(key, value));

            if (maxChange < epsilon) break;
        }

        this.networkMetrics.pageRank = pr;
    }

    calculateBetweennessCentrality() {
        const n = this.nodes.length;
        if (n < 3) return;

        const betweenness = new Map();
        this.nodes.forEach((node) => betweenness.set(node.id, 0));

        // For each node as source
        this.nodes.forEach((source) => {
            const stack = [];
            const paths = new Map();
            const sigma = new Map();
            const delta = new Map();
            const distance = new Map();

            // Initialize
            this.nodes.forEach((node) => {
                paths.set(node.id, []);
                sigma.set(node.id, 0);
                delta.set(node.id, 0);
                distance.set(node.id, -1);
            });

            sigma.set(source.id, 1);
            distance.set(source.id, 0);

            const queue = [source.id];

            // BFS
            while (queue.length > 0) {
                const v = queue.shift();
                stack.push(v);

                // Get neighbors
                const neighbors = [];
                this.links.forEach((link) => {
                    const sourceId = link.source.id || link.source;
                    const targetId = link.target.id || link.target;
                    if (sourceId === v) neighbors.push(targetId);
                    if (targetId === v) neighbors.push(sourceId);
                });

                neighbors.forEach((w) => {
                    // First time we visit w?
                    if (distance.get(w) < 0) {
                        queue.push(w);
                        distance.set(w, distance.get(v) + 1);
                    }

                    // Shortest path to w via v?
                    if (distance.get(w) === distance.get(v) + 1) {
                        sigma.set(w, sigma.get(w) + sigma.get(v));
                        paths.get(w).push(v);
                    }
                });
            }

            // Accumulation
            while (stack.length > 0) {
                const w = stack.pop();
                paths.get(w).forEach((v) => {
                    const coefficient =
                        (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
                    delta.set(v, delta.get(v) + coefficient);
                });

                if (w !== source.id) {
                    betweenness.set(w, betweenness.get(w) + delta.get(w));
                }
            }
        });

        // Normalize
        const normalizationFactor = n > 2 ? (n - 1) * (n - 2) : 1;
        betweenness.forEach((value, key) => {
            betweenness.set(key, value / normalizationFactor);
        });

        this.networkMetrics.betweennessCentrality = betweenness;
    }

    calculateClosenessCentrality() {
        this.networkMetrics.closenessCentrality.clear();

        this.nodes.forEach((node) => {
            const distances = this.singleSourceShortestPath(node.id);
            const reachableNodes = Array.from(distances.values()).filter(
                (d) => d > 0,
            );

            if (reachableNodes.length === 0) {
                this.networkMetrics.closenessCentrality.set(node.id, 0);
                return;
            }

            const totalDistance = reachableNodes.reduce((sum, d) => sum + d, 0);
            const closeness = reachableNodes.length / totalDistance;
            this.networkMetrics.closenessCentrality.set(node.id, closeness);
        });
    }

    calculateEigenvectorCentrality(iterations = 100, epsilon = 1e-6) {
        const n = this.nodes.length;
        if (n === 0) return;

        // Initialize eigenvector values
        const eigenvector = new Map();
        this.nodes.forEach((node) =>
            eigenvector.set(node.id, 1.0 / Math.sqrt(n)),
        );

        // Build adjacency matrix representation
        const adj = this.buildAdjacencyMap();

        // Power iteration
        for (let iter = 0; iter < iterations; iter++) {
            const newEigenvector = new Map();
            let maxChange = 0;

            this.nodes.forEach((node) => {
                let sum = 0;
                adj.get(node.id)?.forEach((neighbor) => {
                    sum += eigenvector.get(neighbor) || 0;
                });
                newEigenvector.set(node.id, sum);
            });

            // Normalize
            const norm = Math.sqrt(
                Array.from(newEigenvector.values()).reduce(
                    (sum, val) => sum + val * val,
                    0,
                ),
            );
            if (norm > 0) {
                newEigenvector.forEach((value, key) => {
                    const normalizedValue = value / norm;
                    newEigenvector.set(key, normalizedValue);
                    maxChange = Math.max(
                        maxChange,
                        Math.abs(normalizedValue - (eigenvector.get(key) || 0)),
                    );
                });
            }

            eigenvector.clear();
            newEigenvector.forEach((value, key) => eigenvector.set(key, value));

            if (maxChange < epsilon) break;
        }

        this.networkMetrics.eigenvectorCentrality = eigenvector;
    }

    calculateNetworkCentralization() {
        // Calculate using degree centrality as base
        const degreeCentralities = Array.from(
            this.networkMetrics.degreeCentrality.values(),
        );
        if (degreeCentralities.length === 0) return;

        const maxCentrality = Math.max(...degreeCentralities);
        const sumDeviations = degreeCentralities.reduce((sum, centrality) => {
            return sum + (maxCentrality - centrality);
        }, 0);

        const n = this.nodes.length;
        const maxPossibleSum = ((n - 1) * (n - 2)) / (n - 1); // For normalized degree centrality

        this.networkMetrics.networkCentralization =
            n > 2 ? sumDeviations / maxPossibleSum : 0;

        // Calculate centrality entropy
        const totalCentrality = degreeCentralities.reduce(
            (sum, c) => sum + c,
            0,
        );
        if (totalCentrality > 0) {
            this.networkMetrics.centralityEntropy = -degreeCentralities.reduce(
                (entropy, centrality) => {
                    const p = centrality / totalCentrality;
                    return entropy + (p > 0 ? p * Math.log2(p) : 0);
                },
                0,
            );
        }
    }

    calculateStructuralMetrics() {
        this.calculateDiameterAndRadius();
        this.calculateAssortativity();
        this.calculateSmallWorldness();
    }

    calculateDiameterAndRadius() {
        let maxDistance = 0;
        let minEccentricity = Infinity;

        this.nodes.forEach((node) => {
            const distances = this.singleSourceShortestPath(node.id);
            const finiteDistances = Array.from(distances.values()).filter(
                (d) => d < Infinity && d > 0,
            );

            if (finiteDistances.length > 0) {
                const eccentricity = Math.max(...finiteDistances);
                maxDistance = Math.max(maxDistance, eccentricity);
                minEccentricity = Math.min(minEccentricity, eccentricity);
            }
        });

        this.networkMetrics.diameter = maxDistance;
        this.networkMetrics.radius =
            minEccentricity === Infinity ? 0 : minEccentricity;
    }

    calculateAssortativity() {
        if (this.links.length === 0) {
            this.networkMetrics.assortativity = 0;
            return;
        }

        const degrees = new Map();
        this.nodes.forEach((node) => {
            degrees.set(node.id, this.getNodeDegree(node.id));
        });

        let numerator = 0;
        let sumSquares = 0;
        let sumDegrees = 0;

        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            const sourceDegree = degrees.get(sourceId);
            const targetDegree = degrees.get(targetId);

            numerator += sourceDegree * targetDegree;
            sumSquares +=
                (sourceDegree * sourceDegree + targetDegree * targetDegree) / 2;
            sumDegrees += (sourceDegree + targetDegree) / 2;
        });

        const m = this.links.length;
        if (m === 0) {
            this.networkMetrics.assortativity = 0;
            return;
        }

        const meanSquareDegree = sumSquares / m;
        const meanDegree = sumDegrees / m;
        const variance = meanSquareDegree - meanDegree * meanDegree;

        this.networkMetrics.assortativity =
            variance > 0
                ? (numerator / m - meanDegree * meanDegree) / variance
                : 0;
    }

    calculateSmallWorldness() {
        // Small-worldness = (C/C_random) / (L/L_random)
        // where C is clustering coefficient, L is average path length

        const actualC = this.networkMetrics.clusteringCoefficient / 100; // Convert from percentage
        const actualL = this.networkMetrics.averagePathLength;

        if (actualL === 0) {
            this.networkMetrics.smallWorldness = 0;
            return;
        }

        // Estimate random network values
        const n = this.nodes.length;
        const m = this.links.length;
        const p = m / ((n * (n - 1)) / 2); // Edge probability

        const randomC = p; // Expected clustering coefficient for random graph
        const randomL = Math.log(n) / Math.log(n * p); // Expected path length for random graph

        if (randomC > 0 && randomL > 0) {
            this.networkMetrics.smallWorldness =
                actualC / randomC / (actualL / randomL);
        } else {
            this.networkMetrics.smallWorldness = 0;
        }
    }

    calculateTemporalMetrics() {
        this.calculateBurstiness();
        this.calculateTemporalEfficiency();
        this.calculateSessionCoherence();
    }

    calculateBurstiness() {
        // Calculate burstiness of browsing activity using timestamps
        const allTimestamps = [];
        this.nodes.forEach((node) => {
            allTimestamps.push(...node.visitTimestamps);
        });

        if (allTimestamps.length < 2) {
            this.networkMetrics.burstiness = 0;
            return;
        }

        allTimestamps.sort((a, b) => a - b);

        // Calculate inter-event times
        const interEventTimes = [];
        for (let i = 1; i < allTimestamps.length; i++) {
            interEventTimes.push(allTimestamps[i] - allTimestamps[i - 1]);
        }

        if (interEventTimes.length === 0) {
            this.networkMetrics.burstiness = 0;
            return;
        }

        // Burstiness parameter B = (σ - μ) / (σ + μ)
        const mean =
            interEventTimes.reduce((sum, time) => sum + time, 0) /
            interEventTimes.length;
        const variance =
            interEventTimes.reduce(
                (sum, time) => sum + Math.pow(time - mean, 2),
                0,
            ) / interEventTimes.length;
        const stdDev = Math.sqrt(variance);

        this.networkMetrics.burstiness =
            stdDev > 0 ? (stdDev - mean) / (stdDev + mean) : 0;
    }

    calculateTemporalEfficiency() {
        // Measure how efficiently users navigate over time
        let totalEfficiency = 0;
        let sessionCount = 0;

        this.clusters.forEach((cluster) => {
            if (cluster.nodes.length < 2) return;

            // Calculate path efficiency within session
            const sessionNodes = cluster.nodes.sort((a, b) => {
                const aTime = Math.min(...a.visitTimestamps);
                const bTime = Math.min(...b.visitTimestamps);
                return aTime - bTime;
            });

            let directConnections = 0;
            let totalPossibleConnections = sessionNodes.length - 1;

            for (let i = 0; i < sessionNodes.length - 1; i++) {
                const currentNode = sessionNodes[i];
                const nextNode = sessionNodes[i + 1];

                // Check if there's a direct link between consecutive temporal nodes
                const hasDirectLink = this.links.some((link) => {
                    const sourceId = link.source.id || link.source;
                    const targetId = link.target.id || link.target;
                    return (
                        (sourceId === currentNode.id &&
                            targetId === nextNode.id) ||
                        (sourceId === nextNode.id &&
                            targetId === currentNode.id)
                    );
                });

                if (hasDirectLink) directConnections++;
            }

            if (totalPossibleConnections > 0) {
                totalEfficiency += directConnections / totalPossibleConnections;
                sessionCount++;
            }
        });

        this.networkMetrics.temporalEfficiency =
            sessionCount > 0 ? (totalEfficiency / sessionCount) * 100 : 0;
    }

    calculateSessionCoherence() {
        // Measure how coherent each browsing session is
        let totalCoherence = 0;
        let validSessions = 0;

        this.clusters.forEach((cluster) => {
            if (cluster.nodes.length < 2) return;

            // Calculate domain consistency within session
            const domains = cluster.nodes.map((node) => node.domain);
            const uniqueDomains = new Set(domains);
            const domainCoherence =
                1 - (uniqueDomains.size - 1) / (domains.length - 1);

            // Calculate temporal coherence (smaller time gaps = higher coherence)
            const timestamps = [];
            cluster.nodes.forEach((node) =>
                timestamps.push(...node.visitTimestamps),
            );
            timestamps.sort((a, b) => a - b);

            if (timestamps.length < 2) return;

            const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
            const averageGap = timeSpan / (timestamps.length - 1);
            const temporalCoherence = Math.exp(-averageGap / (60 * 1000)); // Decay factor for minutes

            totalCoherence += (domainCoherence + temporalCoherence) / 2;
            validSessions++;
        });

        this.networkMetrics.sessionCoherence =
            validSessions > 0 ? (totalCoherence / validSessions) * 100 : 0;
    }

    calculateInformationTheoreticMetrics() {
        this.calculateNetworkEntropy();
        this.calculateMutualInformation();
        this.calculateTransferEntropy();
    }

    calculateNetworkEntropy() {
        // Calculate entropy based on degree distribution
        const degrees = this.nodes.map((node) => this.getNodeDegree(node.id));
        const maxDegree = Math.max(...degrees);

        if (maxDegree === 0) {
            this.networkMetrics.networkEntropy = 0;
            return;
        }

        // Create degree distribution
        const degreeDistribution = new Array(maxDegree + 1).fill(0);
        degrees.forEach((degree) => degreeDistribution[degree]++);

        // Calculate entropy
        const totalNodes = this.nodes.length;
        this.networkMetrics.networkEntropy = -degreeDistribution.reduce(
            (entropy, count) => {
                if (count === 0) return entropy;
                const p = count / totalNodes;
                return entropy + p * Math.log2(p);
            },
            0,
        );
    }

    calculateMutualInformation() {
        // Calculate mutual information between domains
        const domainPairs = new Map();
        const domainCounts = new Map();

        // Count domain occurrences and pairs
        this.links.forEach((link) => {
            const sourceNode = this.nodes.find(
                (n) => n.id === (link.source.id || link.source),
            );
            const targetNode = this.nodes.find(
                (n) => n.id === (link.target.id || link.target),
            );

            if (sourceNode && targetNode) {
                const sourceDomain = sourceNode.domain;
                const targetDomain = targetNode.domain;

                domainCounts.set(
                    sourceDomain,
                    (domainCounts.get(sourceDomain) || 0) + 1,
                );
                domainCounts.set(
                    targetDomain,
                    (domainCounts.get(targetDomain) || 0) + 1,
                );

                const pairKey = `${sourceDomain}->${targetDomain}`;
                domainPairs.set(pairKey, (domainPairs.get(pairKey) || 0) + 1);
            }
        });

        const totalEdges = this.links.length;
        if (totalEdges === 0) {
            this.networkMetrics.mutualInformation = 0;
            return;
        }

        // Calculate mutual information
        let mutualInfo = 0;
        domainPairs.forEach((pairCount, pairKey) => {
            const [sourceDomain, targetDomain] = pairKey.split("->");
            const sourceCount = domainCounts.get(sourceDomain) || 0;
            const targetCount = domainCounts.get(targetDomain) || 0;

            const p_xy = pairCount / totalEdges;
            const p_x = sourceCount / totalEdges;
            const p_y = targetCount / totalEdges;

            if (p_xy > 0 && p_x > 0 && p_y > 0) {
                mutualInfo += p_xy * Math.log2(p_xy / (p_x * p_y));
            }
        });

        this.networkMetrics.mutualInformation = mutualInfo;
    }

    calculateTransferEntropy() {
        // Simplified transfer entropy based on temporal navigation patterns
        let transferEntropy = 0;
        let pairCount = 0;

        this.clusters.forEach((cluster) => {
            const sortedNodes = cluster.nodes.sort((a, b) => {
                return (
                    Math.min(...a.visitTimestamps) -
                    Math.min(...b.visitTimestamps)
                );
            });

            for (let i = 0; i < sortedNodes.length - 2; i++) {
                const node1 = sortedNodes[i];
                const node2 = sortedNodes[i + 1];
                const node3 = sortedNodes[i + 2];

                // Simple transfer entropy approximation
                // TE(X->Y) ≈ I(Y_{t+1}; X_t | Y_t)
                const domain1 = node1.domain;
                const domain2 = node2.domain;
                const domain3 = node3.domain;

                if (domain1 === domain3 && domain1 !== domain2) {
                    transferEntropy += 1; // Evidence of influence
                }
                pairCount++;
            }
        });

        this.networkMetrics.transferEntropy =
            pairCount > 0 ? transferEntropy / pairCount : 0;
    }

    // **UTILITY METHODS**

    buildAdjacencyMap() {
        const adj = new Map();
        this.nodes.forEach((node) => adj.set(node.id, new Set()));

        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            adj.get(sourceId)?.add(targetId);
            adj.get(targetId)?.add(sourceId);
        });

        return adj;
    }

    singleSourceShortestPath(sourceId) {
        const distances = new Map();
        const visited = new Set();
        const queue = [sourceId];

        distances.set(sourceId, 0);

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            const currentDistance = distances.get(current);

            // Find neighbors
            this.links.forEach((link) => {
                const sourceId = link.source.id || link.source;
                const targetId = link.target.id || link.target;
                let neighbor = null;

                if (sourceId === current) neighbor = targetId;
                else if (targetId === current) neighbor = sourceId;

                if (neighbor && !visited.has(neighbor)) {
                    const newDistance = currentDistance + 1;
                    if (
                        !distances.has(neighbor) ||
                        distances.get(neighbor) > newDistance
                    ) {
                        distances.set(neighbor, newDistance);
                        queue.push(neighbor);
                    }
                }
            });
        }

        return distances;
    }

    getNodeDegree(nodeId) {
        let degree = 0;
        this.links.forEach((link) => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            if (sourceId === nodeId || targetId === nodeId) degree++;
        });
        return degree;
    }

    getTopNodeByCentrality(centralityType) {
        const centralityMap = this.networkMetrics[centralityType];
        if (!centralityMap || centralityMap.size === 0) return "None";

        let maxCentrality = -1;
        let topNodeId = null;

        centralityMap.forEach((centrality, nodeId) => {
            if (centrality > maxCentrality) {
                maxCentrality = centrality;
                topNodeId = nodeId;
            }
        });

        if (topNodeId) {
            const topNode = this.nodes.find((node) => node.id === topNodeId);
            return topNode
                ? this.formatUrlForDisplay(topNode.url, { maxLength: 25 })
                : "Unknown";
        }

        return "None";
    }

    // Enhanced node information with centrality metrics
    getNodeCentralityInfo(node) {
        const centralityInfo = {};

        // Get all centrality values for this node
        centralityInfo.pageRank =
            this.networkMetrics.pageRank.get(node.id) || 0;
        centralityInfo.betweenness =
            this.networkMetrics.betweennessCentrality.get(node.id) || 0;
        centralityInfo.closeness =
            this.networkMetrics.closenessCentrality.get(node.id) || 0;
        centralityInfo.eigenvector =
            this.networkMetrics.eigenvectorCentrality.get(node.id) || 0;
        centralityInfo.degree =
            this.networkMetrics.degreeCentrality.get(node.id) || 0;

        return centralityInfo;
    }

    setupSearchFunctionality() {
        const searchToggleBtn = document.getElementById("search-toggle-btn");
        const searchInputContainer = document.getElementById(
            "search-input-container",
        );
        const searchInput = document.getElementById("evolution-search");
        const controlButtons = document.getElementById("control-buttons");

        let isSearchActive = false;

        // Search toggle button click handler
        searchToggleBtn.addEventListener("click", () => {
            this.showSearchInput();
            isSearchActive = true;
        });

        // Search input blur handler - collapse if empty and not focused
        searchInput.addEventListener("blur", (e) => {
            // Delay to allow other events to register
            setTimeout(() => {
                if (
                    !searchInput.value.trim() &&
                    document.activeElement !== searchInput
                ) {
                    this.hideSearchInput();
                    isSearchActive = false;
                }
            }, 150);
        });

        // Search functionality
        searchInput.addEventListener("input", (e) => {
            const keyword = e.target.value.toLowerCase().trim();

            if (keyword) {
                this.highlightMatchingNodes(keyword);
            } else {
                this.clearNodeHighlight();
            }
        });

        // ESC key handler to collapse search
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                searchInput.blur();
                this.hideSearchInput();
                isSearchActive = false;
            }
        });

        // Initialize evolution state but don't auto-start
        this.initializeEvolutionState();
    }

    showSearchInput() {
        const searchToggleBtn = document.getElementById("search-toggle-btn");
        const searchInputContainer = document.getElementById(
            "search-input-container",
        );
        const searchInput = document.getElementById("evolution-search");
        const controlButtons = document.getElementById("control-buttons");

        // Fade out search toggle button
        searchToggleBtn.style.opacity = "0";

        // Fade out control buttons
        controlButtons.style.opacity = "0";

        setTimeout(() => {
            // Hide search toggle button
            searchToggleBtn.style.display = "none";

            // Show search input container
            searchInputContainer.style.display = "block";
            searchInputContainer.style.opacity = "0";

            // Hide control buttons
            controlButtons.style.display = "none";

            // Expand search input and fade in
            searchInput.style.width = "400px";
            searchInput.style.borderColor = "#4285f4";
            searchInput.style.boxShadow = "0 0 0 2px rgba(66, 133, 244, 0.2)";

            // Fade in search input
            setTimeout(() => {
                searchInputContainer.style.opacity = "1";
                searchInput.focus();
            }, 10);
        }, 150);
    }

    hideSearchInput() {
        const searchToggleBtn = document.getElementById("search-toggle-btn");
        const searchInputContainer = document.getElementById(
            "search-input-container",
        );
        const searchInput = document.getElementById("evolution-search");
        const controlButtons = document.getElementById("control-buttons");

        // Clear search and highlights
        searchInput.value = "";
        this.clearNodeHighlight();

        // Fade out search input
        searchInputContainer.style.opacity = "0";

        setTimeout(() => {
            // Restore search input to normal size
            searchInput.style.width = "200px";
            searchInput.style.borderColor = "#ddd";
            searchInput.style.boxShadow = "none";

            // Hide search input container
            searchInputContainer.style.display = "none";

            // Show search toggle button and control buttons
            searchToggleBtn.style.display = "flex";
            searchToggleBtn.style.opacity = "0";

            controlButtons.style.display = "flex";
            controlButtons.style.opacity = "0";

            // Fade in toggle button and controls
            setTimeout(() => {
                searchToggleBtn.style.opacity = "1";
                controlButtons.style.opacity = "1";
            }, 10);
        }, 150);
    }

    highlightMatchingNodes(keyword) {
        if (!this.nodeElements || !keyword) {
            this.clearNodeHighlight();
            return;
        }

        // Find matching nodes
        const matchingNodes = this.nodes.filter((node) => {
            const url = node.url ? node.url.toLowerCase() : "";
            const domain = node.domain ? node.domain.toLowerCase() : "";
            const displayUrl = this.formatUrlForDisplay(node.url).toLowerCase();

            return (
                url.includes(keyword) ||
                domain.includes(keyword) ||
                displayUrl.includes(keyword)
            );
        });

        // Clear previous highlights
        this.clearNodeHighlight();

        // Highlight matching nodes
        this.nodeElements
            .classed("search-highlighted", (d) => {
                return matchingNodes.some((match) => match.id === d.id);
            })
            .select("circle")
            .style("stroke", (d) => {
                const isMatch = matchingNodes.some(
                    (match) => match.id === d.id,
                );
                return isMatch ? "#ff6b6b" : "#2d3436";
            })
            .style("stroke-width", (d) => {
                const isMatch = matchingNodes.some(
                    (match) => match.id === d.id,
                );
                return isMatch ? "4px" : "2px";
            })
            .style("filter", (d) => {
                const isMatch = matchingNodes.some(
                    (match) => match.id === d.id,
                );
                return isMatch
                    ? "drop-shadow(0 0 8px rgba(255, 107, 107, 0.6))"
                    : "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.1))";
            });

        // Dim non-matching nodes
        this.nodeElements.style("opacity", (d) => {
            const isMatch = matchingNodes.some((match) => match.id === d.id);
            return isMatch ? 1 : 0.3;
        });

        // Also dim non-related links
        if (this.linkElements) {
            this.linkElements.style("opacity", (d) => {
                const sourceMatch = matchingNodes.some(
                    (match) => match.id === d.source.id,
                );
                const targetMatch = matchingNodes.some(
                    (match) => match.id === d.target.id,
                );
                return sourceMatch || targetMatch ? 0.6 : 0.1;
            });
        }

        console.log(
            `Found ${matchingNodes.length} nodes matching "${keyword}"`,
        );
    }

    clearNodeHighlight() {
        if (!this.nodeElements) return;

        // Remove search highlighting class
        this.nodeElements.classed("search-highlighted", false);

        // Restore original node styles
        this.nodeElements
            .style("opacity", 1)
            .select("circle")
            .style("stroke", "#2d3436")
            .style("stroke-width", "2px")
            .style("filter", "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.1))");

        // Restore original link styles
        if (this.linkElements) {
            this.linkElements.style("opacity", 0.6);
        }
    }

    setDefaultDateTime() {
        const timeElement = document.getElementById("evolution-time-main");
        console.log("Setting default date/time, element found:", timeElement);

        if (timeElement) {
            const now = new Date();
            const formattedDateTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
            timeElement.textContent = formattedDateTime;
            console.log("Set date/time to:", formattedDateTime);
        } else {
            console.error("evolution-time-main element not found!");
        }
    }

    // CSV Export Component
    createCSVExportButton() {
        // Add CSV button to the existing controls container
        const controlsContainer = document.querySelector(".controls");
        if (!controlsContainer) {
            console.error("Controls container not found");
            return;
        }

        // Main CSV export button using the same .btn class as SVG button
        const csvButton = document.createElement("button");
        csvButton.id = "csv-export-btn";
        csvButton.innerHTML = ".csv";
        csvButton.className = "btn"; // Use same class as SVG button

        // Export dropdown menu
        const dropdownMenu = document.createElement("div");
        dropdownMenu.id = "csv-dropdown-menu";
        dropdownMenu.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            min-width: 180px;
            display: none;
            z-index: 1001;
            margin-bottom: 5px;
        `;

        const menuItems = [
            { text: "Export Nodes Data", action: () => this.exportNodesCSV() },
            { text: "Export Links Data", action: () => this.exportLinksCSV() },
            {
                text: "Export Complete Dataset",
                action: () => this.exportCompleteCSV(),
            },
        ];

        menuItems.forEach((item, index) => {
            const menuItem = document.createElement("div");
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 10px 15px;
                cursor: pointer;
                border-bottom: ${
                    index < menuItems.length - 1 ? "1px solid #f0f0f0" : "none"
                };
                transition: background-color 0.2s ease;
            `;

            menuItem.addEventListener("mouseenter", () => {
                menuItem.style.backgroundColor = "#f8f9fa";
            });

            menuItem.addEventListener("mouseleave", () => {
                menuItem.style.backgroundColor = "transparent";
            });

            menuItem.addEventListener("click", () => {
                item.action();
                dropdownMenu.style.display = "none";
            });

            dropdownMenu.appendChild(menuItem);
        });

        // Toggle dropdown on button click
        csvButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display === "block";
            dropdownMenu.style.display = isVisible ? "none" : "block";
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", () => {
            dropdownMenu.style.display = "none";
        });

        // Create a container for the CSV button and its dropdown
        const csvContainer = document.createElement("div");
        csvContainer.style.cssText = `
            position: relative;
        `;

        csvContainer.appendChild(csvButton);
        csvContainer.appendChild(dropdownMenu);
        controlsContainer.appendChild(csvContainer);
    }

    exportNodesCSV() {
        if (!this.nodes || this.nodes.length === 0) {
            alert("No node data available to export");
            return;
        }

        const headers = [
            "id",
            "url",
            "domain",
            "visitCount",
            "tabId",
            "sessionId",
            "isActive",
            "cluster",
            "dwellTime",
            "entropy",
            "returnVelocity",
            "visitTimestamps",
            "visitSequence",
            "visitingSessions",
        ];

        const csvContent = [
            headers.join(","),
            ...this.nodes.map((node) =>
                [
                    node.id,
                    `"${this.escapeCSV(node.url)}"`,
                    `"${this.escapeCSV(node.domain)}"`,
                    node.visitCount,
                    node.tabId,
                    `"${node.sessionId}"`,
                    node.isActive,
                    node.cluster,
                    node.dwellTime.toFixed(2),
                    node.entropy.toFixed(4),
                    node.returnVelocity.toFixed(4),
                    `"${node.visitTimestamps.join(";")}"`,
                    `"${node.visitSequence.join(";")}"`,
                    `"${node.visitingSessions.join(";")}"`,
                ].join(","),
            ),
        ].join("\n");

        this.downloadCSV(csvContent, "network_nodes.csv");
    }

    exportLinksCSV() {
        if (!this.links || this.links.length === 0) {
            alert("No link data available to export");
            return;
        }

        const headers = [
            "sourceId",
            "targetId",
            "sourceUrl",
            "targetUrl",
            "weight",
            "traversalCount",
            "cluster",
            "interCluster",
        ];

        const csvContent = [
            headers.join(","),
            ...this.links.map((link) => {
                const sourceNode = this.nodes.find(
                    (n) => n.id === (link.source.id || link.source),
                );
                const targetNode = this.nodes.find(
                    (n) => n.id === (link.target.id || link.target),
                );

                return [
                    link.source.id || link.source,
                    link.target.id || link.target,
                    `"${this.escapeCSV(sourceNode?.url || "unknown")}"`,
                    `"${this.escapeCSV(targetNode?.url || "unknown")}"`,
                    link.weight || 1,
                    link.traversalCount || 1,
                    link.cluster || "unknown",
                    link.interCluster || false,
                ].join(",");
            }),
        ].join("\n");

        this.downloadCSV(csvContent, "network_links.csv");
    }

    exportCompleteCSV() {
        // Create a comprehensive export with multiple sheets in one file
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        // Export all data types
        this.exportNodesCSV();
        setTimeout(() => this.exportLinksCSV(), 100);

        console.log("Complete dataset exported as separate CSV files");
    }

    escapeCSV(str) {
        if (typeof str !== "string") return str;
        return str.replace(/"/g, '""');
    }

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        console.log(`CSV exported: ${filename}`);
    }

    setupStorageListener() {
        // Listen for changes in Chrome storage
        if (
            typeof chrome !== "undefined" &&
            chrome.storage &&
            chrome.storage.onChanged
        ) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === "local" && changes.graphData) {
                    console.log(
                        "📡 Detected data change in storage, refreshing graph...",
                    );
                    this.loadData();
                }
            });
        }

        // Also add a periodic refresh (every 30 seconds) as fallback
        setInterval(() => {
            this.checkForDataUpdates();
        }, 30000);
    }

    async checkForDataUpdates() {
        try {
            if (typeof chrome !== "undefined" && chrome.storage) {
                const result = await chrome.storage.local.get(["graphData"]);
                const newData = result.graphData;

                // Check if we have new data compared to current data
                if (newData && this.data) {
                    const newSessionCount = newData.sessions
                        ? newData.sessions.length
                        : 0;
                    const currentSessionCount = this.data.sessions
                        ? this.data.sessions.length
                        : 0;

                    // Get total visits for comparison
                    const newTotalVisits = newData.totalVisits || 0;
                    const currentTotalVisits = this.data.totalVisits || 0;

                    if (
                        newSessionCount !== currentSessionCount ||
                        newTotalVisits !== currentTotalVisits
                    ) {
                        console.log(
                            "📡 Detected new browsing data, refreshing graph...",
                        );
                        this.loadData();
                    }
                }
            }
        } catch (error) {
            console.log("⚠️ Error checking for data updates:", error);
        }
    }

    updateDataSourceIndicator(dataType) {
        const urlDisplayBox = document.getElementById("urlDisplayBox");
        const clusterInfo = document.getElementById("clusterInfo");

        if (clusterInfo) {
            clusterInfo.innerHTML = `
                <div style="color: white; font-weight: 600;">
                     Tab cluster - Hover over a node to see details
                </div>
            `;
            if (urlDisplayBox) {
                urlDisplayBox.style.background = "#ff6b6b";
            }
        }
    }
}

// Initialize the graph when the page loads
document.addEventListener("DOMContentLoaded", () => {
    window.visualizer = new BrowsingGraphVisualizer();
});
