document.addEventListener("DOMContentLoaded", async () => {
    await loadData();
    setupEventListeners();
});

async function loadData() {
    try {
        console.log("📞 Requesting data from background script...");

        const data = await chrome.runtime.sendMessage({ action: "getData" });

        console.log("📦 Received data:", data);

        // Handle case where data is undefined or null
        if (!data) {
            throw new Error("No response from background script");
        }

        if (data.error) {
            throw new Error(data.error);
        }

        updateStats(data);
        updateRecentActivity(data);
    } catch (error) {
        console.error("❌ Error loading data:", error);
        showError("Failed to load browsing data");

        // Show default values when data loading fails
        updateStats({
            totalVisits: 0,
            totalEdges: 0,
            activeSessions: 0,
        });

        const recentList = document.getElementById("recentList");
        recentList.innerHTML =
            '<div class="loading">Extension is starting up. Please wait a moment and try again.</div>';
    }
}

function updateStats(data) {
    // Fix: Use the correct properties from the background script
    document.getElementById("nodeCount").textContent = data.totalVisits || 0;
    document.getElementById("edgeCount").textContent = data.totalEdges || 0;
    document.getElementById("sessionCount").textContent =
        data.activeSessions || 0;
}

function getUrlDisplayText(url) {
    try {
        const urlObj = new URL(url);

        // For Google search results, show the search query
        if (
            urlObj.hostname.includes("google.com") &&
            urlObj.searchParams.has("q")
        ) {
            const query = urlObj.searchParams.get("q");
            return `🔍 "${query}"`;
        }

        // For other URLs, show a clean version
        let display = urlObj.pathname;

        // If there are search params, show some of them
        if (urlObj.search) {
            const params = urlObj.searchParams;
            const importantParams = [];

            // Show common important parameters
            for (const [key, value] of params) {
                if (["q", "search", "query", "s"].includes(key.toLowerCase())) {
                    importantParams.push(
                        `${key}=${value.substring(0, 20)}${
                            value.length > 20 ? "..." : ""
                        }`,
                    );
                }
            }

            if (importantParams.length > 0) {
                display += `?${importantParams.join("&")}`;
            } else if (urlObj.search.length < 50) {
                display += urlObj.search;
            } else {
                display += urlObj.search.substring(0, 47) + "...";
            }
        }

        // If it's just the root path, show the full hostname
        if (display === "/" || display === "") {
            display = urlObj.hostname;
        }

        return display;
    } catch (e) {
        // If URL parsing fails, just show the last part of the URL
        return url.length > 50 ? "..." + url.substring(url.length - 47) : url;
    }
}

function updateRecentActivity(data) {
    const recentList = document.getElementById("recentList");

    if (!data.sessions || data.sessions.length === 0) {
        recentList.innerHTML =
            '<div class="loading">No browsing data yet. Start browsing to see your graph!</div>';
        return;
    }

    // Show sessions instead of aggregated domains
    const activeSessions = data.sessions
        .filter((session) => session.domains && session.domains.length > 0)
        .slice(0, 8); // Show top 8 sessions

    if (activeSessions.length === 0) {
        recentList.innerHTML =
            '<div class="loading">No domain visits recorded yet. Browse some websites!</div>';
        return;
    }

    recentList.innerHTML = activeSessions
        .map((session) => {
            const statusIcon = session.isActive ? "🟢" : "🔴";
            const statusText = session.isActive ? "Active" : "Closed";
            const tabInfo = `Tab ${session.tabId}`;

            // Get current domain (last in navigation order)
            const currentDomain =
                session.domains.length > 0
                    ? session.domains[session.domains.length - 1].domain
                    : "Unknown";

            // Create domain summary
            const domainSummary =
                session.domains.length > 1
                    ? `${currentDomain} (+${session.domains.length - 1} more)`
                    : currentDomain;

            return `
                <div class="session-item">
                    <div class="session-header">
                        <div class="session-info">
                            <div class="session-title">
                                <span class="session-status">${statusIcon} ${tabInfo}</span>
                                <span class="session-meta">${statusText}</span>
                            </div>
                            <div class="session-summary">${domainSummary}</div>
                        </div>
                        <div class="session-stats">
                            <span class="session-count">${
                                session.totalVisits
                            } visits</span>
                            <span class="session-domains">${
                                session.totalDomains
                            } domains</span>
                        </div>
                    </div>
                    <div class="session-details" style="display: none;">
                        ${session.domains
                            .map(
                                (domain) => `
                            <div class="domain-section">
                                <div class="domain-header">
                                    <span class="domain-name">${
                                        domain.domain
                                    }</span>
                                    <span class="domain-count">${
                                        domain.visitCount
                                    } visits</span>
                                </div>
                                <div class="url-list">
                                    ${(domain.urls || [])
                                        .map(
                                            (url) => `
                                        <div class="url-item">
                                            <span class="url-text" title="${url}">${getUrlDisplayText(
                                                url,
                                            )}</span>
                                        </div>
                                    `,
                                        )
                                        .join("")}
                                </div>
                            </div>
                        `,
                            )
                            .join("")}
                    </div>
                </div>
            `;
        })
        .join("");

    // Add click handlers to toggle session details
    document.querySelectorAll(".session-header").forEach((header) => {
        header.addEventListener("click", () => {
            const details = header.nextElementSibling;
            const isVisible = details.style.display !== "none";
            details.style.display = isVisible ? "none" : "block";

            // Update expand icon if it exists
            const expandIcon = header.querySelector(".expand-icon");
            if (expandIcon) {
                expandIcon.style.transform = isVisible
                    ? "rotate(0deg)"
                    : "rotate(180deg)";
            }
        });
    });
}

function setupEventListeners() {
    // View Graph button
    document.getElementById("viewGraph").addEventListener("click", () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL("graph.html"),
        });
    });

    document.getElementById("clearData").addEventListener("click", async () => {
        if (
            confirm(
                "Are you sure you want to clear all browsing data? This cannot be undone.",
            )
        ) {
            try {
                await chrome.runtime.sendMessage({ action: "clearData" });
                await loadData(); // Refresh to show cleared data
                showSuccess("Data cleared successfully");
            } catch (error) {
                console.error("Error clearing data:", error);
                showError("Failed to clear data");
            }
        }
    });

    document.getElementById("testData").addEventListener("click", async () => {
        try {
            await chrome.runtime.sendMessage({ action: "testData" });
            await loadData(); // Refresh to show new data
            showSuccess("Test data added");
        } catch (error) {
            console.error("Error adding test data:", error);
            showError("Failed to add test data");
        }
    });
}

function showError(message) {
    const statusText = document.getElementById("statusText");
    statusText.textContent = `🔴 ${message}`;
    statusText.style.color = "#e53e3e";

    setTimeout(() => {
        statusText.textContent = "🟢 Tracking active";
        statusText.style.color = "";
    }, 3000);
}

function showSuccess(message) {
    const statusText = document.getElementById("statusText");
    statusText.textContent = `✅ ${message}`;
    statusText.style.color = "#38a169";

    setTimeout(() => {
        statusText.textContent = "🟢 Tracking active";
        statusText.style.color = "";
    }, 3000);
}

setInterval(loadData, 10000);
