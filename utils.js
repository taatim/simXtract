// Formatting
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value || 0);
}

// Export
function exportData() {
    const invoices = window.appState.invoices;
    if (!invoices.length) {
        alert('No data to export');
        return;
    }

    // Prepare data for export
    const data = invoices.map(inv => ({
        Status: inv.is_duplicate ? 'DUPLICATE' : 'OK',
        Date: inv.date,
        InvoiceNumber: inv.invoice_number,
        Vendor: inv.vendor,
        Category: inv.category,
        Description: inv.description,
        Qty: inv.qty,
        UnitCost: inv.unit_cost || inv.your_cost || 0,
        TotalCost: ((inv.unit_cost || inv.your_cost || 0) * (inv.qty || 1)).toFixed(2)
    }));

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");

    // Save File
    XLSX.writeFile(wb, `InvoiceAI_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
