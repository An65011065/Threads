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

        document.getElementById("urlCount").textContent = urlsLast24h;
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

    handleNodeHover(event, node) {
        // Update URL display box
        document.getElementById(
            "clusterInfo",
        ).textContent = `tab cluster: ${node.tabId}`;
        document.getElementById("urlInfo").textContent = node.url;

        // Update metrics to show node-specific values
        this.updateMetricsDisplay(node);

        // Show tooltip
        this.showNodeTooltip(event, node);
    }

    handleNodeOut() {
        // Reset URL display box
        document.getElementById("clusterInfo").textContent = "tab cluster: -";
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

        tooltip.innerHTML = `
            <strong>${node.domain}</strong><br>
            <em>${
                node.url.length > 50
                    ? node.url.substring(0, 47) + "..."
                    : node.url
            }</em><br>
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
        tooltip.innerHTML = `
            <strong>${node.domain}</strong><br>
            <em>${node.url}</em><br>
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
}

// Initialize the graph when the page loads
document.addEventListener("DOMContentLoaded", () => {
    new BrowsingGraphVisualizer();
});
