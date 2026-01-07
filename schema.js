/**
 * Central Schema Definition
 * Defines the Google Sheet Structure and Gemini JSON Output.
 */
const SCHEMA = {
    // The exact column order in the Google Sheet
    HEADERS: [
        'threadId', // Unique Thread ID (Primary Key)
        'Contact_Date', 'Request_Date', 'Negotiation_Date', 'Negotiation_Location', 'Decision_Date', 'Briefing_Date', 'Briefing_Location', 'Tech_Check_Date', 'Tech_Check_Location', 'Talk_Date', 'Talk_Location',
        'Duration', 'Billing_Date', 'Payment_Date', 'Status', 'Language', 'Netto_Fee', 'Payment_Details',
        'Event', 'Theme', 'Audience_Composition', 'Audience_Size', 'Expections_of_Speaker', 'AI_Analysis',
        'Title_Suggestions', 'Final_Title', 'About_Talk', 'About_Speaker', 'For_Moderator', 'Event_Invite',
        'Tech_Requirement', 'Handout', 'Event_Location', 'Hotel', 'Travel_Plan', 'Event_Entities',
        'Referer', 'Kampagne', 'ToDoList', 'Notes', 'Sources'
    ],

    // The JSON Schema for Gemini Pro/Flash
    GEMINI_JSON: {
        type: "OBJECT",
        properties: {
            events: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        Contact_Date: { type: "STRING" },
                        Request_Date: { type: "STRING" },
                        Negotiation_Date: { type: "STRING" },

                        // Location Objects
                        Negotiation_Location: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Room: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Decision_Date: { type: "STRING" },
                        Briefing_Date: { type: "STRING" },

                        Briefing_Location: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Room: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Tech_Check_Date: { type: "STRING" },

                        Tech_Check_Location: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Room: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Talk_Date: { type: "STRING" },

                        Talk_Location: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Room: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Duration: { type: "STRING" },
                        Billing_Date: { type: "STRING" },
                        Payment_Date: { type: "STRING" },
                        Status: { type: "STRING" },
                        Language: { type: "STRING" },
                        Netto_Fee: { type: "STRING" },
                        Payment_Details: { type: "STRING" },
                        Event: { type: "STRING" },
                        Theme: { type: "STRING" },
                        Audience_Composition: { type: "STRING" },
                        Audience_Size: { type: "STRING" },
                        Expections_of_Speaker: { type: "STRING" },
                        AI_Analysis: { type: "STRING" },
                        Title_Suggestions: { type: "STRING" },
                        Final_Title: { type: "STRING" },
                        About_Talk: { type: "STRING" },
                        About_Speaker: { type: "STRING" },
                        For_Moderator: { type: "STRING" },
                        Event_Invite: { type: "STRING" },
                        Tech_Requirement: { type: "STRING" },
                        Handout: { type: "STRING" },

                        Event_Location: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Room: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Hotel: {
                            type: "OBJECT",
                            properties: {
                                Venue: { type: "STRING" },
                                Street: { type: "STRING" },
                                City: { type: "STRING" },
                                Link: { type: "STRING" }
                            }
                        },

                        Event_Entities: {
                            type: "OBJECT",
                            properties: {
                                Organisation: { type: "STRING" },
                                Type: { type: "STRING" },
                                Contacts: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            Name: { type: "STRING" },
                                            Email: { type: "STRING" },
                                            Phone: { type: "STRING" }
                                        }
                                    }
                                }
                            }
                        },

                        Referer: { type: "STRING" },
                        Kampagne: { type: "STRING" },
                        ToDoList: { type: "STRING" },
                        Notes: { type: "STRING" }
                    },
                    required: [
                        "Contact_Date", "Request_Date", "Talk_Date", "Status",
                        "Event", "Netto_Fee", "ToDoList"
                    ]
                }
            }
        }
    }
};
