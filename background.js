// Tab-aware browsing tracker with proper visit counting

console.log("🎯 Browsing Graph Extension - Starting...");

class TabAwareBrowsingTracker {
    constructor() {
        this.data = {
            sessions: new Map(), // tabId -> session info
            edges: [], // navigation sequences between domains
        };

        this.setupListeners();
        this.loadData();
        this.saveTimeout = null;
    }

    setupListeners() {
        console.log("Setting up tab-aware listeners...");

        // Track new tabs (new sessions)
        chrome.tabs.onCreated.addListener((tab) => {
            const sessionId = this.generateSessionId();
            console.log("🆕 New tab/session:", tab.id, sessionId);

            this.data.sessions.set(tab.id, {
                sessionId: sessionId,
                tabId: tab.id,
                created: Date.now(),
                domains: new Map(), // domain -> {visitCount, firstVisit, lastVisit, urls: []}
                navigationOrder: [], // sequence of domains visited
                lastUpdate: Date.now(),
            });
        });

        // Track navigation within tabs
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (
                changeInfo.status === "complete" &&
                tab.url &&
                !tab.url.startsWith("chrome://") &&
                !tab.url.startsWith("chrome-extension://")
            ) {
                console.log("📄 Page loaded in tab", tabId, ":", tab.url);
                this.handleNavigation(tabId, tab.url);
            }
        });

        // Track tab activation (switching between tabs)
        chrome.tabs.onActivated.addListener((activeInfo) => {
            console.log("🔄 Tab activated:", activeInfo.tabId);
            this.updateSessionActivity(activeInfo.tabId);
        });

        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
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
        });

        console.log("✅ Tab-aware listeners set up");
    }

    generateSessionId() {
        return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    updateSessionActivity(tabId) {
        const session = this.data.sessions.get(tabId);
        if (session) {
            session.lastUpdate = Date.now();
        }
    }

    handleNavigation(tabId, url) {
        try {
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
                    created: Date.now(),
                    domains: new Map(),
                    navigationOrder: [],
                    lastUpdate: Date.now(),
                };
                this.data.sessions.set(tabId, session);
            }

            const domain = new URL(url).hostname;
            const now = Date.now();

            console.log(
                "🔍 Processing navigation in tab",
                tabId,
                "to:",
                domain,
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
                    this.data.edges.push(edge);
                    console.log("🔗 Created edge:", prevDomain, "->", domain);
                }
            }

            // Increment visit count and update data
            domainData.visitCount++;
            domainData.lastVisit = now;

            // Store unique URLs
            if (!domainData.urls.includes(url)) {
                domainData.urls.push(url);
            }

            session.lastUpdate = now;

            console.log("📊 Updated domain data:", {
                domain,
                visitCount: domainData.visitCount,
                tabId,
                sessionId: session.sessionId,
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
                edges: this.data.edges,
                lastUpdated: Date.now(),
            };

            await chrome.storage.local.set({ browsingData: dataToSave });
            console.log("💾 Data saved:", {
                sessions: sessionsArray.length,
                edges: this.data.edges.length,
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
                if (data.sessions) {
                    this.data.sessions = new Map(
                        data.sessions.map(([tabId, session]) => [
                            tabId,
                            {
                                ...session,
                                domains: new Map(session.domains),
                            },
                        ]),
                    );
                }

                // Restore edges
                this.data.edges = data.edges || [];

                console.log("📖 Loaded data:", {
                    sessions: this.data.sessions.size,
                    edges: this.data.edges.length,
                });
            }
        } catch (error) {
            console.error("❌ Error loading data:", error);
        }
    }

    getCurrentData() {
        const sessions = [];
        const now = Date.now();

        for (const [tabId, session] of this.data.sessions) {
            const isActive =
                !session.closed && now - session.lastUpdate < 30 * 60 * 1000; // Active if updated in last 30 min

            const domains = [];
            let totalVisits = 0;

            // Convert domains map to array with visit counts
            for (const [domainName, domainData] of session.domains) {
                domains.push({
                    domain: domainName,
                    visitCount: domainData.visitCount,
                    firstVisit: domainData.firstVisit,
                    lastVisit: domainData.lastVisit,
                    urls: domainData.urls,
                });
                totalVisits += domainData.visitCount;
            }

            // Sort domains by navigation order
            const orderedDomains = session.navigationOrder
                .map((domainName) => {
                    return domains.find((d) => d.domain === domainName);
                })
                .filter(Boolean);

            sessions.push({
                sessionId: session.sessionId,
                tabId: tabId,
                created: session.created,
                lastUpdate: session.lastUpdate,
                isActive: isActive,
                isClosed: !!session.closed,
                domains: orderedDomains,
                totalVisits: totalVisits,
                totalDomains: domains.length,
            });
        }

        // Sort sessions by last update (most recent first)
        sessions.sort((a, b) => b.lastUpdate - a.lastUpdate);

        return {
            sessions: sessions,
            activeSessions: sessions.filter((s) => s.isActive).length,
            totalSessions: sessions.length,
            totalEdges: this.data.edges.length,
            totalVisits: sessions.reduce((sum, s) => sum + s.totalVisits, 0),
        };
    }

    addTestData() {
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
            });

            this.data.sessions.set(testSession.tabId, session);
        });

        this.scheduleSave();
        console.log("🧪 Test data added with multiple sessions");
    }

    clearData() {
        this.data.sessions.clear();
        this.data.edges = [];
        this.saveData();
        console.log("🗑️ All data cleared");
    }
}

// Create tracker instance
const tracker = new TabAwareBrowsingTracker();

// Handle popup requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 Message received:", request.action);

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
});

console.log("🚀 Tab-aware background script ready!");
