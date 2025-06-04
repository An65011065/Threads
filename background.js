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

        this.saveTimeout = null;
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupListeners();
            console.log("✅ Tracker initialized successfully");
        } catch (error) {
            console.error("❌ Error during initialization:", error);
            // Ensure we have valid data even if loading fails
            this.ensureValidData();
            this.setupListeners();
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
                    this.data.tabRelationships.push({
                        parentTabId: tab.openerTabId,
                        childTabId: tab.id,
                        timestamp: Date.now(),
                    });
                }

                this.data.sessions.set(tab.id, {
                    sessionId: sessionId,
                    tabId: tab.id,
                    parentTabId: tab.openerTabId || null,
                    created: Date.now(),
                    domains: new Map(), // domain -> {visitCount, firstVisit, lastVisit, urls: []}
                    navigationOrder: [], // sequence of domains visited
                    urlSequence: [], // CHRONOLOGICAL sequence of all URLs visited (the fix!)
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
                }
            } catch (error) {
                console.error("❌ Error in onUpdated:", error);
            }
        });

        // Track tab activation (switching between tabs)
        chrome.tabs.onActivated.addListener((activeInfo) => {
            try {
                console.log("🔄 Tab activated:", activeInfo.tabId);
                this.updateSessionActivity(activeInfo.tabId);
            } catch (error) {
                console.error("❌ Error in onActivated:", error);
            }
        });

        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            try {
                console.log("❌ Tab closed:", tabId);
                if (this.data.sessions.has(tabId)) {
                    const session = this.data.sessions.get(tabId);
                    session.closed = Date.now();
                    // Keep closed sessions for a while for graph purposes
                    setTimeout(() => {
                        this.data.sessions.delete(tabId);
                        this.scheduleSave();
                    }, 5 * 60 * 1000); // Keep for 5 minutes
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
                    parentTabId: null, // We don't have opener info for existing tabs
                    created: Date.now(),
                    domains: new Map(),
                    navigationOrder: [],
                    urlSequence: [], // Initialize chronological URL sequence
                    lastUpdate: Date.now(),
                };
                this.data.sessions.set(tabId, session);
            }

            // Ensure session has all required properties
            if (!session.domains) session.domains = new Map();
            if (!session.navigationOrder) session.navigationOrder = [];
            if (!session.urlSequence) session.urlSequence = []; // Ensure urlSequence exists

            const domain = new URL(url).hostname;
            const now = Date.now();

            console.log(
                "🔍 Processing navigation in tab",
                tabId,
                "to:",
                domain,
            );

            // **THE KEY FIX**: Add URL to chronological sequence immediately
            session.urlSequence.push({
                url: url,
                domain: domain,
                timestamp: now,
                sequenceIndex: session.urlSequence.length,
            });

            console.log(
                `📍 Added to sequence #${session.urlSequence.length}: ${url}`,
            );

            // Get or create domain data for this session
            let domainData = session.domains.get(domain);
            if (!domainData) {
                domainData = {
                    visitCount: 0,
                    firstVisit: now,
                    lastVisit: now,
                    urls: [],
                };
                session.domains.set(domain, domainData);

                // Add to navigation order only on first visit
                session.navigationOrder.push(domain);
                console.log("🆕 First visit to", domain, "in tab", tabId);

                // Create edge from previous domain if exists
                if (session.navigationOrder.length > 1) {
                    const prevDomain =
                        session.navigationOrder[
                            session.navigationOrder.length - 2
                        ];
                    const edge = {
                        from: prevDomain,
                        to: domain,
                        sessionId: session.sessionId,
                        tabId: tabId,
                        timestamp: now,
                    };

                    // Ensure edges array exists
                    if (!this.data.edges) {
                        this.data.edges = [];
                    }

                    this.data.edges.push(edge);
                    console.log("🔗 Created edge:", prevDomain, "->", domain);
                }
            }

            // Increment visit count and update data
            domainData.visitCount++;
            domainData.lastVisit = now;

            // Store unique URLs (keep this for backward compatibility)
            if (!domainData.urls.includes(url)) {
                domainData.urls.push(url);
            }

            session.lastUpdate = now;

            console.log("📊 Updated domain data:", {
                domain,
                visitCount: domainData.visitCount,
                tabId,
                sessionId: session.sessionId,
                totalUrlsInSequence: session.urlSequence.length,
            });

            this.scheduleSave();
        } catch (error) {
            console.error("❌ Error handling navigation:", error);
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
                        domains: Array.from(session.domains.entries()),
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
                                domains: new Map(session.domains || []),
                                navigationOrder: session.navigationOrder || [],
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

                const domains = [];
                let totalVisits = 0;

                // Convert domains map to array with visit counts
                if (session.domains) {
                    for (const [domainName, domainData] of session.domains) {
                        domains.push({
                            domain: domainName,
                            visitCount: domainData.visitCount || 0,
                            firstVisit: domainData.firstVisit || now,
                            lastVisit: domainData.lastVisit || now,
                            urls: domainData.urls || [],
                        });
                        totalVisits += domainData.visitCount || 0;
                    }
                }

                // Sort domains by navigation order
                const navigationOrder = session.navigationOrder || [];
                const orderedDomains = navigationOrder
                    .map((domainName) => {
                        return domains.find((d) => d.domain === domainName);
                    })
                    .filter(Boolean);

                sessions.push({
                    sessionId: session.sessionId,
                    tabId: tabId,
                    created: session.created || now,
                    lastUpdate: session.lastUpdate || now,
                    isActive: isActive,
                    isClosed: !!session.closed,
                    domains: orderedDomains,
                    totalVisits: totalVisits,
                    totalDomains: domains.length,
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
                    (sum, s) => sum + s.totalVisits,
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

    addTestData() {
        try {
            this.ensureValidData();

            // Create test sessions
            const testSessions = [
                {
                    tabId: 9999,
                    domains: [
                        { domain: "google.com", visits: 8 },
                        { domain: "gmail.com", visits: 3 },
                        { domain: "youtube.com", visits: 2 },
                    ],
                },
                {
                    tabId: 9998,
                    domains: [
                        { domain: "google.com", visits: 4 },
                        { domain: "stackoverflow.com", visits: 6 },
                        { domain: "github.com", visits: 1 },
                    ],
                },
            ];

            testSessions.forEach((testSession) => {
                const sessionId = "test_session_" + testSession.tabId;
                const now = Date.now();

                const session = {
                    sessionId: sessionId,
                    tabId: testSession.tabId,
                    created: now,
                    domains: new Map(),
                    navigationOrder: [],
                    urlSequence: [], // Initialize chronological URL sequence
                    lastUpdate: now,
                };

                testSession.domains.forEach((domainInfo, index) => {
                    session.domains.set(domainInfo.domain, {
                        visitCount: domainInfo.visits,
                        firstVisit: now + index * 1000,
                        lastVisit: now + index * 1000 + 60000,
                        urls: [`https://${domainInfo.domain}`],
                    });
                    session.navigationOrder.push(domainInfo.domain);
                    session.urlSequence.push({
                        url: `https://${domainInfo.domain}`,
                        domain: domainInfo.domain,
                        timestamp: now + index * 1000,
                        sequenceIndex: index + 1,
                    });
                });

                this.data.sessions.set(testSession.tabId, session);
            });

            this.scheduleSave();
            console.log("🧪 Test data added with multiple sessions");
        } catch (error) {
            console.error("❌ Error adding test data:", error);
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

        if (request.action === "testData") {
            tracker.addTestData();
            sendResponse({ success: true });
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
