// Tab-aware browsing tracker with proper visit counting

console.log("🎯 Browsing Graph Extension - Starting...");

class TabAwareBrowsingTracker {
    constructor() {
        // Initialize with proper defaults
        this.data = {
            sessions: new Map(), // tabId -> session info
            edges: [], // navigation sequences between domains
            tabRelationships: [], // parent-child relationships between tabs
        };

        // Track active pages for time calculation
        this.activePages = new Map(); // tabId -> {url, startTime, domain}
        this.focusedTabId = null; // Currently focused tab

        this.saveTimeout = null;
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupListeners();
            this.startPeriodicCleanup();
            console.log("✅ Tracker initialized successfully");
        } catch (error) {
            console.error("❌ Error during initialization:", error);
            // Ensure we have valid data even if loading fails
            this.ensureValidData();
            this.setupListeners();
            this.startPeriodicCleanup();
        }
    }

    ensureValidData() {
        if (!this.data) {
            this.data = {};
        }
        if (!this.data.sessions) {
            this.data.sessions = new Map();
        }
        if (!this.data.edges) {
            this.data.edges = [];
        }
        if (!this.data.tabRelationships) {
            this.data.tabRelationships = [];
        }
    }

    setupListeners() {
        console.log("Setting up tab-aware listeners...");

        // Track new tabs (new sessions)
        chrome.tabs.onCreated.addListener((tab) => {
            try {
                const sessionId = this.generateSessionId();
                console.log("🆕 New tab/session:", tab.id, sessionId);

                // Track tab relationships (parent-child)
                if (tab.openerTabId) {
                    console.log(
                        "🔗 Tab",
                        tab.id,
                        "opened from tab",
                        tab.openerTabId,
                    );

                    // Get the current URL from the opener tab
                    this.getOpenerTabUrl(tab.openerTabId).then((openerUrl) => {
                        const relationship = {
                            parentTabId: tab.openerTabId,
                            childTabId: tab.id,
                            timestamp: Date.now(),
                            openerUrl: openerUrl, // URL that triggered the new tab
                            targetUrl: null, // Will be filled when child tab loads
                        };

                        this.data.tabRelationships.push(relationship);
                        console.log(
                            "🔗 Inter-tab relationship tracked:",
                            relationship,
                        );
                        this.scheduleSave();
                    });
                }

                this.data.sessions.set(tab.id, {
                    sessionId: sessionId,
                    tabId: tab.id,
                    parentTabId: tab.openerTabId || null,
                    created: Date.now(),
                    urlSequence: [], // Only track URL sequence
                    lastUpdate: Date.now(),
                });
            } catch (error) {
                console.error("❌ Error in onCreated:", error);
            }
        });

        // Track navigation within tabs
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            try {
                if (
                    changeInfo.status === "complete" &&
                    tab.url &&
                    !tab.url.startsWith("chrome://") &&
                    !tab.url.startsWith("chrome-extension://")
                ) {
                    console.log("📄 Page loaded in tab", tabId, ":", tab.url);
                    this.handleNavigation(tabId, tab.url);

                    // Update any pending inter-tab relationships with the target URL
                    this.updatePendingTabRelationships(tabId, tab.url);
                }
            } catch (error) {
                console.error("❌ Error in onUpdated:", error);
            }
        });

        // Track tab activation (switching between tabs)
        chrome.tabs.onActivated.addListener((activeInfo) => {
            try {
                console.log("🔄 Tab activated:", activeInfo.tabId);
                this.handleTabActivation(activeInfo.tabId);
            } catch (error) {
                console.error("❌ Error in onActivated:", error);
            }
        });

        // Track window focus changes
        chrome.windows.onFocusChanged.addListener((windowId) => {
            try {
                if (windowId === chrome.windows.WINDOW_ID_NONE) {
                    console.log("🔍 Browser lost focus");
                    this.handleBrowserFocusChange(false);
                } else {
                    console.log("🔍 Browser gained focus");
                    this.handleBrowserFocusChange(true);
                }
            } catch (error) {
                console.error("❌ Error in onFocusChanged:", error);
            }
        });

        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            try {
                console.log("❌ Tab closed:", tabId);

                // Finalize time tracking for this tab
                this.finalizePreviousPageTime(tabId);

                if (this.data.sessions.has(tabId)) {
                    const session = this.data.sessions.get(tabId);
                    session.closed = Date.now();
                    // Session will be cleaned up by the 24-hour cleanup cycle
                }

                // Clean up tracking data
                this.activePages.delete(tabId);
                if (this.focusedTabId === tabId) {
                    this.focusedTabId = null;
                }
            } catch (error) {
                console.error("❌ Error in onRemoved:", error);
            }
        });

        console.log("✅ Tab-aware listeners set up");
    }

    generateSessionId() {
        return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    async getOpenerTabUrl(openerTabId) {
        try {
            // Get the current URL of the opener tab
            const openerTab = await chrome.tabs.get(openerTabId);
            return openerTab.url || null;
        } catch (error) {
            console.warn("❌ Could not get opener tab URL:", error);
            return null;
        }
    }

    updatePendingTabRelationships(tabId, url) {
        try {
            // Find any pending relationships where this tab is the child
            const pendingRelationships = this.data.tabRelationships.filter(
                (rel) => rel.childTabId === tabId && rel.targetUrl === null,
            );

            pendingRelationships.forEach((rel) => {
                rel.targetUrl = url;
                console.log("🎯 Inter-tab relationship completed:", {
                    from: rel.openerUrl,
                    to: rel.targetUrl,
                    parentTab: rel.parentTabId,
                    childTab: rel.childTabId,
                });
            });

            if (pendingRelationships.length > 0) {
                this.scheduleSave();
            }
        } catch (error) {
            console.error(
                "❌ Error updating pending tab relationships:",
                error,
            );
        }
    }

    updateSessionActivity(tabId) {
        try {
            const session = this.data.sessions.get(tabId);
            if (session) {
                session.lastUpdate = Date.now();
            }
        } catch (error) {
            console.error("❌ Error updating session activity:", error);
        }
    }

    handleNavigation(tabId, url) {
        try {
            // Ensure we have valid data
            this.ensureValidData();

            // Calculate dwell time for the previous page in this tab
            this.finalizePreviousPageTime(tabId);

            // Get or create session for this tab
            let session = this.data.sessions.get(tabId);
            if (!session) {
                const sessionId = this.generateSessionId();
                console.log(
                    "📝 Creating new session for existing tab:",
                    tabId,
                    sessionId,
                );
                session = {
                    sessionId: sessionId,
                    tabId: tabId,
                    parentTabId: null,
                    created: Date.now(),
                    urlSequence: [], // Track URL sequence with actual dwell times
                    lastUpdate: Date.now(),
                };
                this.data.sessions.set(tabId, session);
            }

            // Ensure session has urlSequence
            if (!session.urlSequence) session.urlSequence = [];

            const domain = new URL(url).hostname;
            const now = Date.now();

            console.log("🔍 Processing navigation in tab", tabId, "to:", url);

            // Add URL to chronological sequence with start time
            const urlVisit = {
                url: url,
                domain: domain,
                timestamp: now,
                startTime: now,
                endTime: null, // Will be set when navigating away
                dwellTime: null, // Will be calculated when endTime is set
                sequenceIndex: session.urlSequence.length,
                wasActive: tabId === this.focusedTabId, // Track if tab was active when navigation started
            };

            session.urlSequence.push(urlVisit);
            session.lastUpdate = now;

            // Track this page as active for time calculation
            this.activePages.set(tabId, {
                url: url,
                domain: domain,
                startTime: now,
                urlVisitIndex: session.urlSequence.length - 1, // Reference to the visit in urlSequence
            });

            console.log("📊 Navigation tracked with timing:", {
                domain,
                tabId,
                sessionId: session.sessionId,
                totalUrlsInSequence: session.urlSequence.length,
                url: url,
                startTime: now,
            });

            this.scheduleSave();
        } catch (error) {
            console.error("❌ Error handling navigation:", error);
        }
    }

    finalizePreviousPageTime(tabId) {
        try {
            const activePage = this.activePages.get(tabId);
            if (!activePage) return;

            const session = this.data.sessions.get(tabId);
            if (
                !session ||
                !session.urlSequence ||
                session.urlSequence.length === 0
            )
                return;

            // Find the corresponding URL visit in the session
            const urlVisit = session.urlSequence[activePage.urlVisitIndex];
            if (!urlVisit || urlVisit.endTime !== null) return; // Already finalized

            const now = Date.now();
            const dwellTime = (now - activePage.startTime) / 1000; // Convert to seconds

            // Update the URL visit with end time and calculated dwell time
            urlVisit.endTime = now;
            urlVisit.dwellTime = Math.max(0.1, dwellTime); // Minimum 0.1 seconds

            console.log(
                `⏱️ Finalized page time: ${dwellTime.toFixed(1)}s on ${
                    activePage.url
                }`,
            );

            // Remove from active tracking
            this.activePages.delete(tabId);
        } catch (error) {
            console.error("❌ Error finalizing page time:", error);
        }
    }

    handleTabActivation(tabId) {
        try {
            const previousFocusedTab = this.focusedTabId;
            this.focusedTabId = tabId;

            // Pause time tracking for previously focused tab
            if (previousFocusedTab && previousFocusedTab !== tabId) {
                this.pauseTimeTracking(previousFocusedTab);
            }

            // Resume time tracking for newly focused tab
            this.resumeTimeTracking(tabId);

            this.updateSessionActivity(tabId);
        } catch (error) {
            console.error("❌ Error handling tab activation:", error);
        }
    }

    handleBrowserFocusChange(hasFocus) {
        try {
            if (!hasFocus) {
                // Browser lost focus - pause all time tracking
                console.log("⏸️ Pausing time tracking (browser unfocused)");
                for (const tabId of this.activePages.keys()) {
                    this.pauseTimeTracking(tabId);
                }
            } else {
                // Browser gained focus - resume tracking for focused tab
                console.log("▶️ Resuming time tracking (browser focused)");
                if (this.focusedTabId) {
                    this.resumeTimeTracking(this.focusedTabId);
                }
            }
        } catch (error) {
            console.error("❌ Error handling browser focus change:", error);
        }
    }

    pauseTimeTracking(tabId) {
        try {
            const activePage = this.activePages.get(tabId);
            if (!activePage || activePage.pausedAt) return;

            const now = Date.now();
            const session = this.data.sessions.get(tabId);

            if (
                session &&
                session.urlSequence &&
                session.urlSequence[activePage.urlVisitIndex]
            ) {
                const urlVisit = session.urlSequence[activePage.urlVisitIndex];

                // Add accumulated time to any existing dwell time
                const sessionTime = (now - activePage.startTime) / 1000;
                urlVisit.dwellTime =
                    (urlVisit.dwellTime || 0) + Math.max(0, sessionTime);

                // Mark as paused
                activePage.pausedAt = now;

                console.log(
                    `⏸️ Paused tracking for tab ${tabId}, accumulated ${sessionTime.toFixed(
                        1,
                    )}s`,
                );
            }
        } catch (error) {
            console.error("❌ Error pausing time tracking:", error);
        }
    }

    resumeTimeTracking(tabId) {
        try {
            const activePage = this.activePages.get(tabId);
            if (!activePage) return;

            const now = Date.now();

            // Reset start time for resumed tracking
            activePage.startTime = now;
            delete activePage.pausedAt;

            console.log(`▶️ Resumed tracking for tab ${tabId}`);
        } catch (error) {
            console.error("❌ Error resuming time tracking:", error);
        }
    }

    scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveData(), 1000);
    }

    async saveData() {
        try {
            this.ensureValidData();

            // Convert Maps to arrays for storage
            const sessionsArray = Array.from(this.data.sessions.entries()).map(
                ([tabId, session]) => [
                    tabId,
                    {
                        ...session,
                        urlSequence: session.urlSequence || [],
                    },
                ],
            );

            const dataToSave = {
                sessions: sessionsArray,
                edges: this.data.edges || [],
                tabRelationships: this.data.tabRelationships || [],
                lastUpdated: Date.now(),
            };

            await chrome.storage.local.set({ browsingData: dataToSave });
            console.log("💾 Data saved:", {
                sessions: sessionsArray.length,
                edges: (this.data.edges || []).length,
            });
        } catch (error) {
            console.error("❌ Error saving data:", error);
        }
    }

    async loadData() {
        try {
            const result = await chrome.storage.local.get(["browsingData"]);
            if (result.browsingData) {
                const data = result.browsingData;

                // Restore sessions with proper Map conversion
                if (data.sessions && Array.isArray(data.sessions)) {
                    this.data.sessions = new Map(
                        data.sessions.map(([tabId, session]) => [
                            tabId,
                            {
                                ...session,
                                urlSequence: session.urlSequence || [],
                            },
                        ]),
                    );
                }

                // Restore edges
                this.data.edges = Array.isArray(data.edges) ? data.edges : [];

                // Restore tab relationships
                this.data.tabRelationships = Array.isArray(
                    data.tabRelationships,
                )
                    ? data.tabRelationships
                    : [];

                console.log("📖 Loaded data:", {
                    sessions: this.data.sessions.size,
                    edges: this.data.edges.length,
                    tabRelationships: this.data.tabRelationships.length,
                });
            } else {
                console.log("📖 No saved data found, starting fresh");
            }
        } catch (error) {
            console.error("❌ Error loading data:", error);
            // Reset to defaults on error
            this.data = {
                sessions: new Map(),
                edges: [],
                tabRelationships: [],
            };
        }
    }

    getCurrentData() {
        try {
            this.ensureValidData();

            const sessions = [];
            const now = Date.now();

            for (const [tabId, session] of this.data.sessions) {
                const isActive =
                    !session.closed &&
                    now - session.lastUpdate < 30 * 60 * 1000; // Active if updated in last 30 min

                // Only include sessions that have URLs
                if (!session.urlSequence || session.urlSequence.length === 0) {
                    continue;
                }

                sessions.push({
                    sessionId: session.sessionId,
                    tabId: tabId,
                    created: session.created || now,
                    lastUpdate: session.lastUpdate || now,
                    isActive: isActive,
                    isClosed: !!session.closed,
                    urlSequence: session.urlSequence, // Only this matters now
                });
            }

            // Sort sessions by last update (most recent first)
            sessions.sort((a, b) => b.lastUpdate - a.lastUpdate);

            const result = {
                sessions: sessions,
                activeSessions: sessions.filter((s) => s.isActive).length,
                totalSessions: sessions.length,
                totalEdges: (this.data.edges || []).length,
                totalVisits: sessions.reduce(
                    (sum, s) => sum + s.urlSequence.length,
                    0,
                ),
                tabRelationships: this.data.tabRelationships || [],
            };

            console.log("📤 getCurrentData result:", result);
            return result;
        } catch (error) {
            console.error("❌ Error in getCurrentData:", error);
            return {
                sessions: [],
                activeSessions: 0,
                totalSessions: 0,
                totalEdges: 0,
                totalVisits: 0,
            };
        }
    }

    clearData() {
        try {
            this.data.sessions.clear();
            this.data.edges = [];
            this.data.tabRelationships = [];
            this.saveData();
            console.log("🗑️ All data cleared");
        } catch (error) {
            console.error("❌ Error clearing data:", error);
        }
    }

    // Cleanup when service worker stops
    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
    }

    startPeriodicCleanup() {
        // Clean up old data every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldData();
        }, 60 * 60 * 1000); // Every hour

        // Also run cleanup immediately
        this.cleanupOldData();
    }

    cleanupOldData() {
        try {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            let cleanedCount = 0;

            // Clean up old sessions
            for (const [tabId, session] of this.data.sessions) {
                const sessionAge =
                    now - (session.lastUpdate || session.created || now);

                if (sessionAge > maxAge) {
                    this.data.sessions.delete(tabId);
                    cleanedCount++;
                }
            }

            // Clean up old tab relationships (older than 24 hours)
            const originalRelationshipCount = this.data.tabRelationships.length;
            this.data.tabRelationships = this.data.tabRelationships.filter(
                (rel) => {
                    const relationshipAge = now - rel.timestamp;
                    return relationshipAge <= maxAge;
                },
            );
            const relationshipsRemoved =
                originalRelationshipCount - this.data.tabRelationships.length;

            if (cleanedCount > 0 || relationshipsRemoved > 0) {
                console.log(
                    `🧹 Cleaned up old data: ${cleanedCount} sessions, ${relationshipsRemoved} relationships`,
                );
                this.scheduleSave();
            }
        } catch (error) {
            console.error("❌ Error during cleanup:", error);
        }
    }
}

// Create tracker instance
let tracker;

// Initialize tracker when script loads
(async () => {
    try {
        tracker = new TabAwareBrowsingTracker();
        console.log("🚀 Tab-aware background script ready!");
    } catch (error) {
        console.error("❌ Failed to initialize tracker:", error);
    }
})();

// Handle popup requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 Message received:", request.action);

    try {
        if (!tracker) {
            console.error("❌ Tracker not initialized");
            sendResponse({ error: "Tracker not initialized" });
            return true;
        }

        if (request.action === "getData") {
            const data = tracker.getCurrentData();
            console.log("📤 Sending data:", {
                totalSessions: data.totalSessions,
                activeSessions: data.activeSessions,
                totalVisits: data.totalVisits,
            });
            sendResponse(data);
            return true;
        }

        if (request.action === "clearData") {
            tracker.clearData();
            sendResponse({ success: true });
            return true;
        }

        sendResponse({ error: "Unknown action" });
    } catch (error) {
        console.error("❌ Error handling message:", error);
        sendResponse({ error: error.message });
    }

    return true;
});

// Cleanup when service worker is about to be terminated
self.addEventListener("beforeunload", () => {
    if (tracker) {
        tracker.cleanup();
    }
});
