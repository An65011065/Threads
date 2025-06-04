document.addEventListener("DOMContentLoaded", async () => {
    await loadData();
    setupEventListeners();
});

// Helper function to calculate total time for a session
function calculateSessionTime(session) {
    if (!session.urlSequence || session.urlSequence.length === 0) {
        return 0;
    }

    // Use actual tracked dwell times instead of estimates
    let totalTime = 0;
    console.log(
        `🔍 Calculating session time for session ${
            session.sessionId || session.tabId
        }:`,
    );

    session.urlSequence.forEach((urlItem, index) => {
        console.log(`  URL ${index}: ${urlItem.url}`);
        console.log(`    dwellTime: ${urlItem.dwellTime}`);
        console.log(`    startTime: ${urlItem.startTime}`);
        console.log(`    endTime: ${urlItem.endTime}`);

        if (urlItem.dwellTime && urlItem.dwellTime > 0) {
            // Use actual tracked dwell time
            totalTime += urlItem.dwellTime;
            console.log(
                `    ✅ Using dwellTime: ${urlItem.dwellTime}s (total now: ${totalTime}s)`,
            );
        } else if (urlItem.startTime && urlItem.endTime) {
            // Calculate from start/end times if dwell time not set
            const calculated = Math.max(
                0.1,
                (urlItem.endTime - urlItem.startTime) / 1000,
            );
            totalTime += calculated;
            console.log(
                `    ⚡ Calculated from start/end: ${calculated}s (total now: ${totalTime}s)`,
            );
        } else if (urlItem.startTime && !urlItem.endTime) {
            // For active pages, calculate time from start to now
            const now = Date.now();
            const calculated = Math.max(0.1, (now - urlItem.startTime) / 1000);
            totalTime += calculated;
            console.log(
                `    🔄 Active page calculation: ${calculated}s (total now: ${totalTime}s)`,
            );
        } else {
            console.log(`    ❌ No timing data available for this URL`);
        }
    });

    console.log(
        `📊 Final session time: ${totalTime}s (${formatTime(totalTime)})`,
    );
    return totalTime;
}

// Helper function to calculate domain time
function calculateDomainTime(urls) {
    let totalTime = 0;
    urls.forEach((urlData) => {
        if (typeof urlData === "string") {
            // Old format - no timing data available
            return;
        }

        if (urlData.dwellTime && urlData.dwellTime > 0) {
            totalTime += urlData.dwellTime;
        } else if (urlData.startTime && urlData.endTime) {
            totalTime += Math.max(
                0.1,
                (urlData.endTime - urlData.startTime) / 1000,
            );
        } else if (urlData.startTime && !urlData.endTime) {
            const now = Date.now();
            totalTime += Math.max(0.1, (now - urlData.startTime) / 1000);
        }
    });
    return totalTime;
}

// Helper function to calculate total time across all sessions
function calculateTotalSessionTime(data) {
    if (!data.sessions || data.sessions.length === 0) {
        return 0;
    }

    let totalTime = 0;
    data.sessions.forEach((session) => {
        totalTime += calculateSessionTime(session);
    });

    return totalTime;
}

// Helper function to calculate total unique domains
function calculateTotalDomains(data) {
    if (!data.sessions || data.sessions.length === 0) {
        return 0;
    }

    const uniqueDomains = new Set();
    data.sessions.forEach((session) => {
        if (session.urlSequence) {
            session.urlSequence.forEach((urlItem) => {
                if (urlItem.domain) {
                    uniqueDomains.add(urlItem.domain);
                }
            });
        }
    });

    return uniqueDomains.size;
}

// Helper function to format time duration
function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const minutes = seconds / 60;
        return minutes >= 10
            ? `${Math.round(minutes)}m`
            : `${minutes.toFixed(1)}m`;
    } else {
        const hours = seconds / 3600;
        return `${hours.toFixed(1)}h`;
    }
}

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
    // Calculate new meaningful metrics
    const totalVisits = data.totalVisits || 0;
    const totalSessionTime = calculateTotalSessionTime(data);
    const totalDomains = calculateTotalDomains(data);

    // Update the display
    document.getElementById("nodeCount").textContent = totalVisits;
    document.getElementById("edgeCount").textContent =
        formatTime(totalSessionTime);
    document.getElementById("sessionCount").textContent = totalDomains;
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

    // Show sessions with URL sequences
    const activeSessions = data.sessions
        .filter(
            (session) => session.urlSequence && session.urlSequence.length > 0,
        )
        .slice(0, 8); // Show top 8 sessions

    if (activeSessions.length === 0) {
        recentList.innerHTML =
            '<div class="loading">No URL visits recorded yet. Browse some websites!</div>';
        return;
    }

    recentList.innerHTML = activeSessions
        .map((session) => {
            const statusIcon = session.isActive ? "🟢" : "🔴";
            const statusText = session.isActive ? "Active" : "Closed";
            const tabInfo = `Tab ${session.tabId}`;

            // Get unique domains from URL sequence
            const domains = new Map();
            session.urlSequence.forEach((urlItem) => {
                const domain = urlItem.domain;
                if (!domains.has(domain)) {
                    domains.set(domain, []);
                }
                domains.get(domain).push(urlItem); // Pass the full urlItem object instead of just URL
            });

            // Get current domain (last URL's domain)
            const lastUrl = session.urlSequence[session.urlSequence.length - 1];
            const currentDomain = lastUrl ? lastUrl.domain : "Unknown";

            // Create domain summary
            const domainSummary =
                domains.size > 1
                    ? `${currentDomain} (+${domains.size - 1} more)`
                    : currentDomain;

            // Calculate session time
            const sessionTime = calculateSessionTime(session);

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
                            <span class="session-time">${formatTime(
                                sessionTime,
                            )}</span>
                            <span class="session-domains">${
                                domains.size
                            } domains</span>
                        </div>
                    </div>
                    <div class="session-details" style="display: none;">
                        ${Array.from(domains.entries())
                            .map(([domain, urlItems]) => {
                                const domainTime =
                                    calculateDomainTime(urlItems);
                                return `
                            <div class="domain-section">
                                <div class="domain-header">
                                    <span class="domain-name">${domain}</span>
                                    <span class="domain-time">${formatTime(
                                        domainTime,
                                    )}</span>
                                </div>
                                <div class="url-list">
                                    ${urlItems
                                        .map((urlItem) => {
                                            const url = urlItem.url || urlItem; // Handle both old and new formats
                                            const timeSpent = urlItem.dwellTime
                                                ? ` (${formatTime(
                                                      urlItem.dwellTime,
                                                  )})`
                                                : "";
                                            return `
                                        <div class="url-item">
                                            <span class="url-text" title="${url}">${getUrlDisplayText(
                                                url,
                                            )}${timeSpent}</span>
                                        </div>
                                    `;
                                        })
                                        .join("")}
                                </div>
                            </div>
                        `;
                            })
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
    // View Graph button - FIXED: Store data and open graph
    document.getElementById("viewGraph").addEventListener("click", async () => {
        try {
            // Get fresh data for the graph
            const data = await chrome.runtime.sendMessage({
                action: "getData",
            });

            if (data && !data.error) {
                // Store data in chrome storage for the graph page to access
                await chrome.storage.local.set({ graphData: data });

                // Open the graph page
                chrome.tabs.create({
                    url: chrome.runtime.getURL("graph.html"),
                });
            } else {
                showError("No data available for graph");
            }
        } catch (error) {
            console.error("Error opening graph:", error);
            showError("Failed to open graph");
        }
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

    document
        .getElementById("pauseTracking")
        .addEventListener("click", async () => {
            try {
                // Toggle tracking state
                const response = await chrome.runtime.sendMessage({
                    action: "toggleTracking",
                });
                const button = document.getElementById("pauseTracking");

                if (response && response.isTracking !== undefined) {
                    if (response.isTracking) {
                        button.textContent = "Pause";
                        showSuccess("Tracking resumed");
                    } else {
                        button.textContent = "Resume";
                        showSuccess("Tracking paused");
                    }
                } else {
                    // Fallback: just toggle button text
                    if (button.textContent === "Pause") {
                        button.textContent = "Resume";
                        showSuccess("Tracking paused");
                    } else {
                        button.textContent = "Pause";
                        showSuccess("Tracking resumed");
                    }
                }
            } catch (error) {
                console.error("Error toggling tracking:", error);
                showError("Failed to toggle tracking");
            }
        });
}

function showError(message) {
    const statusText = document.getElementById("statusText");
    statusText.textContent = `🔴 ${message}`;
    statusText.style.color = "#e53e3e";

    setTimeout(() => {
        statusText.textContent = "Tracking active";
        statusText.style.color = "";
    }, 3000);
}

function showSuccess(message) {
    const statusText = document.getElementById("statusText");
    statusText.textContent = `${message}`;
    statusText.style.color = "#38a169";

    setTimeout(() => {
        statusText.textContent = "Tracking active";
        statusText.style.color = "";
    }, 3000);
}

setInterval(loadData, 10000);
