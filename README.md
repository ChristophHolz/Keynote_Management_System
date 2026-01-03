# Keynote_Management_System
This `README.md` is structured as a technical specification and user journey for a development team building a solution with **Google Apps Script** (as the backend/integrator) and **Vue.js** (for the Client and Speaker Portal).

---

# README.md: Keynote Speaker Management System (KSMS)

## Project Overview

A high-automation management tool for professional speakers. It bridges the gap between marketing (Google Ads/HubSpot), lead management (AI-driven email responses), and operational delivery (Portal, Briefing, Analytics).

### Tech Stack

* **Frontend:** Vue.js (Client Portal & Speaker Dashboard)
* **Backend/Integration:** Google Apps Script (GAS)
* **Database:** Google Sheets (as a lightweight DB) or BigQuery (for analytics)
* **Communications:** WhatsApp/Telegram API, Gmail API, HubSpot Webhooks
* **Storage:** Google Drive (Transcript Sync)
* **Calendar:** Google Calendar API

---
 
## User Journeys

### 1. The Client Journey (Inbound to Post-Event)

| Phase | Description |
| --- | --- |
| **Discovery** | The client searches Google and clicks an **Ad** or **Organic link** (tracked via UTM parameters for campaign attribution: e.g., "Christmas 2025"). |
| **Inquiry** | On the landing page, the client submits a structured email or HubSpot form. Behavior on the page is tracked. |
| **AI Response** | An **AI Agent** monitors the inbox, parses the inquiry, and sends an immediate email summary with a **Portal Link** and a **Calendar Booking Link**. |
| **Onboarding** | Client logs into the **Vue.js Portal**. They see tailored lecture titles, download speaker photos, bio texts, and a moderator introduction sheet. |
| **Briefing** | Client books a video call. If they haven't booked within **2 hours**, a manager is alerted. |
| **Post-Event** | Client visits the portal to find an **AI-generated summary** of the keynote based on the uploaded transcript to distribute to their attendees. |

### 2. The Speaker & Manager Journey (Christoph, Daniel, Ebi)

| Phase | Description |
| --- | --- |
| **Lead Alert** | **AI Agent** identifies the region (Europe -> **Daniel Zednik**; Americas/Middle East -> **Ebi Zafir**). An instant notification is sent to **Christoph Holz** and the manager via WhatsApp/Telegram. |
| **Activity Feed** | All client interactions in the portal (e.g., "Client downloaded Bio") are pushed to a **Telegram Group** via GAS Webhooks. |
| **Briefing Sync** | After the Zoom call, GAS pulls the transcript from **Google Drive**. The AI extracts details (fees, dates, content) and populates the system. |
| **Travel Mgmt** | The Speaker/Manager views the integrated **Google Calendar**. Travel blocks are automatically checked against existing appointments to prevent double-booking. |
| **Billing** | On completion, an invoice is generated automatically based on the briefing data and stored in the project file. |
| **Strategic Analysis** | The Speaker accesses the **Analytics View** in Vue.js to filter performance by **Region**, **Manager**, or **Campaign** over specific timeframes (e.g., Q3 vs Q4). |

---

## Technical Architecture (Google Apps Script + Vue.js)

### 1. The "Backend" (Google Apps Script)

* **`Triggers.gs`**: Time-based triggers to monitor Gmail and Google Drive.
* **`TelegramBot.gs`**: Handles outgoing messages to Christoph, Daniel, and Ebi.
* **`CalendarManager.gs`**: Syncs event dates and travel times with Google Calendar.
* **`Invoicing.gs`**: Generates PDFs and handles mail merges for billing.
* **`RegionalRouter.gs`**: Logic to assign leads based on language/location.

### 2. The "Frontend" (Vue.js)

* **`ClientPortal.vue`**: High-end UI for the client to access assets and select titles.
* **`SpeakerDashboard.vue`**: Management view for Christoph/Managers to see all active bookings.
* **`AnalyticsDashboard.vue`**: Data visualization for campaign ROI and regional success.
* **`State Management (Pinia/Vuex)`**: To handle real-time updates from the GAS Web App API.

---

## Automated Logic Flow

1. **Lead Capture:** HubSpot Webhook → Google Apps Script.
2. **Assignment:** * If `Region == 'Europe'` → **Daniel Zednik**.
* Else → **Ebi Zafir**.


3. **2-Hour Escalation:** * Check `BookingStatus` in Google Sheet.
* If `Status == 'Pending'` AND `Time > 2hrs` → **Telegram Alert to Manager**.


4. **Transcript Processing:** * Google Drive New File → AI Parsing → Update `EventDetails` in DB → Show in **Client Portal**.

---

## Success Metrics for Analytics

* **Conversion Rate per Campaign:** (e.g., Summer Fest vs. Conference).
* **Regional Performance:** Revenue generated in Europe vs. Middle East/Americas.
* **Manager Velocity:** Time from inquiry to Video Call booking.

---

**Next Step:** Would you like me to provide the **initial Google Apps Script code** to handle the Telegram notifications based on the regional logic?