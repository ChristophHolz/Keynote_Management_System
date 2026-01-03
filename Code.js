function doGet(e) {
    return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('Keynote Management System')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}

// Google Sheets Helper
function getInquiries() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; // Use first sheet
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    // Map rows to objects based on fixed assumptions or headers
    // Expected Columns: ID | Kunde | Kontaktperson | E-Mail | Datum | Ort | Status | Honorar | Titel | Notizen

    return rows.map((row) => ({
        id: row[0],
        customerName: row[1],
        contactPerson: row[2],
        email: row[3],
        eventDate: row[4], // Date object usually
        location: row[5],
        status: row[6],
        fee: row[7],
        titleProposal: row[8],
        notes: row[9]
    })).filter(item => item.id); // Filter empty rows where ID is missing
}

function getInquiryById(id) {
    const inquiries = getInquiries();
    return inquiries.find(item => item.id == id);
}

// Test Function (Run in GAS Editor)
function testGetInquiries() {
    Logger.log(getInquiries());
}
