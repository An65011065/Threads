class BrowsingGraphVisualizer {
    constructor() {
        this.svg = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.clusters = new Map();
        this.selectedNode = null;
        this.zoomBehavior = null;
        this.expandedMode = true; // Expanded mode default ON

        this.width = window.innerWidth;
        this.height = window.innerHeight - 120; // Account for header and stats

        this.init();
    }

    init() {
        this.setupSVG();
        this.setupFilters();
        this.setupControls();
        this.loadData();

        // Handle window resize
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
    }

    setupFilters() {
        const showInactive = document.getElementById("showInactive");
        const showLabels = document.getElementById("showLabels");
        const expandedMode = document.getElementById("expandedMode");

        showInactive.addEventListener("change", () => this.updateGraph());

        showLabels.addEventListener("change", () => {
            this.svg
                .selectAll(".node text")
                .style("display", showLabels.checked ? "block" : "none");
        });

        expandedMode.addEventListener("change", () => {
            this.expandedMode = expandedMode.checked;
            this.loadData(); // Reload and reprocess data
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

            // Add validation for required data structure
            if (!data.sessions || !Array.isArray(data.sessions)) {
                throw new Error(
                    "Invalid data format: missing or invalid sessions array",
                );
            }

            if (data.sessions.length === 0) {
                throw new Error("No browsing sessions found");
            }

            this.processData(data);
            this.updateStats(data);
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

        if (this.expandedMode) {
            // EXPANDED MODE: Each URL is a node, edges are visit order
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
                });
                let previousNode = null;
                session.domains.forEach((domain) => {
                    (domain.urls || []).forEach((url, urlIndex) => {
                        const nodeKey = `${clusterId}-${url}`;
                        if (!nodeMap.has(nodeKey)) {
                            const node = {
                                id: nodeId++,
                                url: url,
                                domain: domain.domain,
                                visitCount: 1, // Each URL node is a single visit
                                tabId: clusterId,
                                sessionId: session.sessionId,
                                isActive: session.isActive,
                                cluster: clusterId,
                                clusterColor: clusterColor,
                                x: this.width / 2 + (Math.random() - 0.5) * 100,
                                y:
                                    this.height / 2 +
                                    (Math.random() - 0.5) * 100,
                            };
                            this.nodes.push(node);
                            nodeMap.set(nodeKey, node);
                            this.clusters.get(clusterId).nodes.push(node);
                        }
                        const currentNode = nodeMap.get(nodeKey);
                        // Create edge from previous URL in the sequence (within tab)
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
            // No inter-tab edges in expanded mode (first URL in a tab has no incoming edge)
        } else {
            // COLLAPSED MODE: Original domain-based logic
            // ... existing code for domain-based nodes and links ...
            const nodeMap = new Map(); // To avoid duplicate nodes
            let nodeId = 0;
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
                });
                let previousNode = null;
                session.domains.forEach((domain, domainIndex) => {
                    const nodeKey = `${clusterId}-${domain.domain}`;
                    if (!nodeMap.has(nodeKey)) {
                        const node = {
                            id: nodeId++,
                            domain: domain.domain,
                            visitCount: domain.visitCount,
                            urls: domain.urls || [],
                            tabId: clusterId,
                            sessionId: session.sessionId,
                            isActive: session.isActive,
                            cluster: clusterId,
                            clusterColor: clusterColor,
                            x: this.width / 2 + (Math.random() - 0.5) * 100,
                            y: this.height / 2 + (Math.random() - 0.5) * 100,
                        };
                        this.nodes.push(node);
                        nodeMap.set(nodeKey, node);
                        this.clusters.get(clusterId).nodes.push(node);
                    }
                    const currentNode = nodeMap.get(nodeKey);
                    if (previousNode && previousNode.id !== currentNode.id) {
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
            // Add inter-tab relationships as links
            if (data.tabRelationships) {
                data.tabRelationships.forEach((relationship) => {
                    const parentCluster = this.clusters.get(
                        relationship.parentTabId,
                    );
                    const childCluster = this.clusters.get(
                        relationship.childTabId,
                    );
                    if (
                        parentCluster &&
                        childCluster &&
                        parentCluster.nodes.length > 0 &&
                        childCluster.nodes.length > 0
                    ) {
                        const parentNode =
                            parentCluster.nodes[parentCluster.nodes.length - 1];
                        const childNode = childCluster.nodes[0];
                        this.links.push({
                            source: parentNode.id,
                            target: childNode.id,
                            type: "inter-tab",
                            parentTabId: relationship.parentTabId,
                            childTabId: relationship.childTabId,
                        });
                    }
                });
            }
        }
        console.log(
            `📊 Processed: ${this.nodes.length} nodes, ${this.links.length} links, ${this.clusters.size} clusters`,
        );
    }

    getClusterColor(index) {
        const colors = [
            "#4c51bf",
            "#e53e3e",
            "#38a169",
            "#d69e2e",
            "#9f7aea",
            "#ed8936",
            "#0bc5ea",
            "#f56565",
            "#48bb78",
            "#4299e1",
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

        // Create cluster hulls (visual grouping)
        this.createClusterHulls(container);

        // Create links
        this.createLinks(container);

        // Create nodes
        this.createNodes(container);

        // Setup force simulation
        this.setupForceSimulation();
    }

    createClusterHulls(container) {
        // We'll update hulls on each tick of the simulation
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
            .style("stroke", (d) =>
                d.type === "intra-tab" ? "#00eaff" : "#ff0055",
            )
            .style("stroke-width", 3)
            .style("opacity", 0.9)
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
            .on("mouseover", (event, d) => this.showNodeTooltip(event, d))
            .on("mouseout", () => this.hideTooltip());

        // Add circles to nodes
        this.nodeElements
            .append("circle")
            .attr("r", (d) => Math.max(5, Math.min(15, d.visitCount * 2)))
            .attr("fill", (d) => d.clusterColor)
            .attr("opacity", (d) => (d.isActive ? 1 : 0.6));

        // Add labels to nodes
        this.nodeElements
            .append("text")
            .text((d) => this.getNodeLabel(d))
            .attr("dy", (d) => Math.max(5, Math.min(15, d.visitCount * 2)) + 20)
            .style(
                "display",
                document.getElementById("showLabels").checked
                    ? "block"
                    : "none",
            );
    }

    getNodeLabel(node) {
        // Show domain name, truncated if too long
        return node.domain.length > 12
            ? node.domain.substring(0, 12) + "..."
            : node.domain;
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
                    .strength(0.8),
            )
            .force("charge", d3.forceManyBody().strength(-600).distanceMax(300))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force(
                "collision",
                d3
                    .forceCollide()
                    .radius(
                        (d) =>
                            Math.max(18, Math.min(25, d.visitCount * 2)) + 10,
                    ),
            )
            .force("cluster", this.forceCluster())
            .on("tick", () => this.ticked());

        // Run simulation
        this.simulation.alpha(1).restart();
    }

    forceCluster() {
        const strength = 0.1;
        const clusterCenters = new Map();

        // Calculate cluster centers
        this.clusters.forEach((cluster, clusterId) => {
            const nodes = cluster.nodes;
            if (nodes.length > 0) {
                const centerX = d3.mean(nodes, (d) => d.x) || this.width / 2;
                const centerY = d3.mean(nodes, (d) => d.y) || this.height / 2;
                clusterCenters.set(clusterId, { x: centerX, y: centerY });
            }
        });

        return (alpha) => {
            this.nodes.forEach((node) => {
                const center = clusterCenters.get(node.cluster);
                if (center) {
                    const dx = center.x - node.x;
                    const dy = center.y - node.y;
                    node.vx += dx * strength * alpha;
                    node.vy += dy * strength * alpha;
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
            // STRAIGHT LINE INSTEAD OF CURVE
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
                    hulls.push({
                        cluster: clusterId,
                        hull: hull,
                        isActive: cluster.isActive,
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
                const expanded = this.expandHull(d.hull, 20);
                return "M" + expanded.join("L") + "Z";
            });
    }

    expandHull(hull, padding) {
        // Expand hull outward by padding
        const centroid = d3.polygonCentroid(hull);
        return hull.map((point) => {
            const dx = point[0] - centroid[0];
            const dy = point[1] - centroid[1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            const scale = (distance + padding) / distance;
            return [centroid[0] + dx * scale, centroid[1] + dy * scale];
        });
    }

    updateGraph() {
        const showInactive = document.getElementById("showInactive").checked;

        // Filter nodes based on criteria
        const filteredNodes = this.nodes.filter((node) => {
            if (!showInactive && !node.isActive) return false;
            return true;
        });

        // Filter links to only include those between visible nodes
        const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
        const filteredLinks = this.links.filter(
            (link) =>
                visibleNodeIds.has(link.source.id || link.source) &&
                visibleNodeIds.has(link.target.id || link.target),
        );

        // Update simulation
        this.simulation.nodes(filteredNodes);
        this.simulation.force("link").links(filteredLinks);

        // Update visual elements
        this.nodeElements.style("display", (d) =>
            filteredNodes.includes(d) ? "block" : "none",
        );
        this.linkElements.style("display", (d) =>
            filteredLinks.includes(d) ? "block" : "none",
        );

        this.simulation.alpha(0.3).restart();
    }

    selectNode(node) {
        // Update selection
        if (this.selectedNode) {
            this.selectedNode.selected = false;
        }
        this.selectedNode = node;
        node.selected = true;

        // Update visual selection
        this.nodeElements.classed("selected", (d) => d.selected);

        // Update sidebar info
        this.updateNodeInfo(node);

        // Highlight connected links
        this.linkElements.classed(
            "highlighted",
            (d) => d.source.id === node.id || d.target.id === node.id,
        );
    }

    updateNodeInfo(node) {
        const nodeInfo = document.getElementById("nodeInfo");
        if (this.expandedMode) {
            // Show full URL and domain
            nodeInfo.innerHTML = `
                <h4>${node.domain}</h4>
                <p><strong>URL:</strong> <span title="${
                    node.url
                }">${this.truncateUrl(node.url)}</span></p>
                <p><strong>Tab:</strong> ${node.tabId} ${
                node.isActive ? "(Active)" : "(Closed)"
            }</p>
            `;
        } else {
            nodeInfo.innerHTML = `
                <h4>${node.domain}</h4>
                <p><strong>Visit Count:</strong> ${node.visitCount}</p>
                <p><strong>Tab:</strong> ${node.tabId} ${
                node.isActive ? "(Active)" : "(Closed)"
            }</p>
                <p><strong>URLs Visited:</strong></p>
                <ul style="margin: 5px 0; padding-left: 15px; font-size: 11px;">
                    ${node.urls
                        .map(
                            (url) =>
                                `<li title="${url}">${this.truncateUrl(
                                    url,
                                )}</li>`,
                        )
                        .join("")}
                </ul>
            `;
        }
    }

    truncateUrl(url) {
        return url.length > 40 ? url.substring(0, 40) + "..." : url;
    }

    showNodeTooltip(event, node) {
        const tooltip = document.getElementById("tooltip");
        tooltip.innerHTML = `
            <strong>${node.domain}</strong><br>
            ${node.visitCount} visits<br>
            Tab ${node.tabId}
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

    updateStats(data) {
        document.getElementById("tabCount").textContent = data.totalSessions;
        document.getElementById("edgeCount").textContent = this.links.length;
        document.getElementById("visitCount").textContent = this.nodes.length;
    }

    resetZoom() {
        this.svg
            .transition()
            .duration(750)
            .call(this.zoomBehavior.transform, d3.zoomIdentity);
    }

    exportGraph() {
        // Export as SVG
        const svgElement = document.getElementById("graph");
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "browsing-graph.svg";
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
            .attr("fill", "white")
            .attr("font-size", "18px")
            .text(
                "No browsing data available. Open this graph from the extension popup.",
            );
    }

    showError(message) {
        console.error(message);

        // Show error in the UI
        const container = this.svg.select(".graph-container");
        container.selectAll("*").remove();

        container
            .append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height / 2 - 20)
            .attr("text-anchor", "middle")
            .attr("fill", "var(--primary-text)")
            .attr("font-size", "18px")
            .text("❌ " + message);

        container
            .append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height / 2 + 20)
            .attr("text-anchor", "middle")
            .attr("fill", "var(--secondary-text)")
            .attr("font-size", "14px")
            .text("Please open the graph from the extension popup");
    }

    handleResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight - 120;

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
