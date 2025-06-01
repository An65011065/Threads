document.addEventListener("DOMContentLoaded", async () => {
    await loadData();
    setupEventListeners();
});

async function loadData() {
    try {
        console.log("📞 Requesting data from background script...");

        const data = await chrome.runtime.sendMessage({ action: "getData" });

        console.log("📦 Received data:", data);

        if (data.error) {
            throw new Error(data.error);
        }

        updateStats(data);
        updateRecentActivity(data.nodes);
    } catch (error) {
        console.error("❌ Error loading data:", error);
        showError("Failed to load browsing data");
    }
}

function updateStats(data) {
    document.getElementById("nodeCount").textContent = data.nodes.length;
    document.getElementById("edgeCount").textContent = data.edges.length;
    document.getElementById("sessionCount").textContent = data.activeSessions;
}

function updateRecentActivity(nodes) {
    const recentList = document.getElementById("recentList");

    if (nodes.length === 0) {
        recentList.innerHTML =
            '<div class="loading">No browsing data yet. Start browsing to see your graph!</div>';
        return;
    }

    // Sort nodes by visit count and take top 10
    const topNodes = nodes
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, 10);

    recentList.innerHTML = topNodes
        .map(
            (node) => `
      <div class="activity-item">
        <span class="activity-domain">${node.label}</span>
        <span class="activity-count">${node.visitCount} visits</span>
      </div>
    `,
        )
        .join("");
}

function setupEventListeners() {
    // View Graph button
    document.getElementById("viewGraph").addEventListener("click", () => {
        // For now, just open a new tab with a placeholder
        // Later we'll create a full graph visualization page
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
