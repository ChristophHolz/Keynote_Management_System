# Spezifikation: Keynote Speaker Management System (KSMS)

## 1. Überblick
Das KSMS ist eine hochautomatisierte Management-Lösung für professionelle Vortragsredner. Es verbindet Marketing (HubSpot/Ads), Lead-Management (AI & Telegram) und operative Abwicklung (Client Portal, Briefing, Analytics).

## 2. Benutzer-Journeys & Features

### 2.1 Client Journey (Kunde)
**Ziel:** Reibungsloses Onboarding und Event-Vorbereitung.

*   **Inquiry & AI Response**:
    *   Eingang via HubSpot-Formular oder E-Mail.
    *   Sofortige Antwort durch AI-Agent mit Link zum Portal.
*   **Client Portal (Vue.js Web-App)**:
    *   **Login**: Zugriff auf persönliche Event-Daten.
    *   **Asset-Download**: Pressefotos, Biografien, Moderationstexte.
    *   **Themenwahl**: Auswahl/Anpassung des Vortragstitels.
    *   **Briefing**: Buchung eines Video-Calls (Calendly/Google Calendar Integration).
    *   **Post-Event**: Download einer AI-generierten Zusammenfassung des Vortrags (basierend auf Transkript).

### 2.2 Speaker & Manager Journey (Intern)
**Ziel:** Effiziente Verwaltung und strategische Analyse.

*   **Lead-Routing & Alerts**:
    *   Automatische Zuweisung nach Region (Europa -> Daniel, Rest -> Ebi).
    *   Benachrichtigung via **Telegram** an Speaker & Manager.
    *   Eskalation: Alarm, wenn "Briefing Call" nicht binnen 2h gebucht wird.
*   **Activity Feed**:
    *   Echtzeit-Updates im Telegram-Channel (z.B. "Kunde hat Bio heruntergeladen").
*   **Briefing & Transkript**:
    *   Automatischer Import von Zoom-Transkripten aus **Google Drive**.
    *   AI-Extraktion von Event-Details (Honorar, Datum, Ort) in die Datenbank.
*   **Travel Management**:
    *   Auto-Check im Google Calendar auf Konflikte.
    *   Blockieren von Reisezeiten.
*   **Analytics Dashboard**:
    *   Performance-Metriken: Konversionsrate, Umsatz pro Region/Manager.

## 3. Technische Architektur

### 3.1 Frontend (Vue.js)
Das Frontend wird als Single-Page-Application (SPA) gebaut, gehostet via GAS oder extern (z.B. Firebase/Vercel) mit API-Anbindung an GAS.
*   `ClientPortal.vue`: Kundenansicht.
*   `SpeakerDashboard.vue`: Interne Ansicht.
*   **Tech**: Vue 3, Pinia (State), TailwindCSS (oder bestehendes CSS).

### 3.2 Backend (Google Apps Script)
Fungiert als Integrations-Hub und API.
*   **Datenbank**: Google Sheets (Stammdaten, Leads) & Google Drive (Dateien).
*   **API-Endpunkte (`doGet`/`doPost`)**: Für Kommunikation mit dem Vue-Frontend.
*   **Module**:
    *   `TelegramBot.gs`: Messaging Interface.
    *   `Triggers.gs`: Überwachung von Mail/Drive.
    *   `CalendarManager.gs`: Kalender-Sync.
    *   `RegionalRouter.gs`: Logik-Verteilung.

### 3.3 Integrationen
*   **HubSpot**: Webhook bei neuem Deal -> Trigger GAS.
*   **OpenAI API**: Für Antwort-Mails und Transkript-Analyse.
*   **Google Drive**: Speicher für Transkripte und Assets.
*   **Google Calendar**: Terminverwaltung.

## 4. Datenmodell (Google Sheet)
Erwartete Haupt-Tabellen:
1.  **Leads**: ID, Kunde, Status (New, Onboarding, Briefing, Closed), Region, Manager.
2.  **Events**: Datum, Ort, Honorar, Titel, Transkript-Link.
3.  **Logs**: Timestamp, Action, User (für Activity Feed).
