const $ = (id) => document.getElementById(id);
const appKey = 'simply-bill-v1';
const accountKey = 'higherFolioAccount-v1';
const accountSessionKey = 'higherFolioUnlocked-v1';
const customerKey = 'higherFolioCustomers-v1';
const businessesKey = 'higherFolioBusinesses-v1';
const activeBusinessKey = 'higherFolioActiveBusiness-v1';
const expensesKey = 'higherFolioExpenses-v1';
const vendorsKey = 'higherFolioVendors-v1';
let template = 'soft';
let nextSequence = Number(localStorage.getItem('higherFolioNext') || localStorage.getItem('simplyBillNext') || '1');
let businessProfile = {};
let pendingQrData = null;
let pendingLogoData = null;
let archiveFilter = 'all';
let businessProfiles = [];
let editingBusinessId = null;
let bookkeepingView = 'overview';

const symbol = (currency) => currency === 'INR' ? '₹ ' : '<img class="dirham-icon" src="assets/uae-dirham-symbol.png" alt="Dirham" />';
const amount = (number) => `${symbol($('currency').value)}${Number(number || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const localDate = new Date();
const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
$('issueDate').value = today;
$('expenseDate').value = today;

const threeDigits = (value) => String(value).padStart(3, '0').slice(-3);
const randomLead = () => Math.floor(100 + Math.random() * 900);
function julianDay(dateValue) {
  const date = new Date(`${dateValue || today}T12:00:00`);
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}
function createInvoice(sequence) { return { lead: randomLead(), sequence, saved: false }; }
let currentInvoice = createInvoice(nextSequence);
function invoiceId() { return `${threeDigits(currentInvoice.lead)}-${threeDigits(currentInvoice.julian ?? julianDay($('issueDate').value))}-${threeDigits(currentInvoice.sequence)}`; }

function itemInputs() { return [...document.querySelectorAll('.item-row:not(.item-labels)')]; }
function itemData() { return itemInputs().map(row => ({description: row.querySelector('input:first-child').value.trim(), amount: Number(row.querySelector('input[type="number"]').value || 0)})).filter(item => item.description || item.amount); }
function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Today'; }
function taxBreakdown(taxable) {
  const region = $('taxRegion').value;
  if (region === 'india') {
    const rate = Number($('indiaGstRate').value);
    if ($('indiaSupply').value === 'local') {
      const componentRate = rate / 2;
      const componentAmount = taxable * componentRate / 100;
      return { rows: [{label: `CGST ${componentRate}%`, amount: componentAmount}, {label: `SGST / UTGST ${componentRate}%`, amount: componentAmount}], total: componentAmount * 2 };
    }
    return { rows: [{label: `IGST ${rate}%`, amount: taxable * rate / 100}], total: taxable * rate / 100 };
  }
  if (region === 'uae') {
    const treatment = $('uaeVatType').value;
    const rate = treatment === 'standard' ? 5 : 0;
    const label = treatment === 'standard' ? 'VAT 5%' : treatment === 'zero' ? 'VAT 0% (zero-rated)' : 'VAT exempt';
    return { rows: [{label, amount: taxable * rate / 100}], total: taxable * rate / 100 };
  }
  return { rows: [], total: 0 };
}
function updatePaymentControls() {
  const paid = $('paymentStatus').value === 'paid';
  $('paymentViaField').hidden = !paid;
  if (!paid) $('paymentVia').value = '';
  $('markPaidButton').hidden = !currentInvoice.saved || paid;
}
function updateSavedInvoice() {
  if (!currentInvoice.saved) return;
  const records = JSON.parse(localStorage.getItem(appKey) || '[]');
  const totals = render();
  localStorage.setItem(appKey, JSON.stringify(records.map(record => record.number === invoiceId() ? {...record, customer: $('customerName').value.trim(), currency: $('currency').value, total: totals.total, template, documentType: $('documentType').value, paymentStatus: $('paymentStatus').value, paymentVia: $('paymentVia').value, snapshot: billSnapshot()} : record)));
}

function makeUpiQr(total) {
  if ($('currency').value !== 'INR' || !businessProfile.upiId || !window.HigherFolioQRCode) return '';
  const payUrl = new URL('upi://pay');
  payUrl.searchParams.set('pa', businessProfile.upiId);
  payUrl.searchParams.set('pn', businessProfile.accountName || businessProfile.name || 'Business');
  payUrl.searchParams.set('am', Number(total).toFixed(2));
  payUrl.searchParams.set('cu', 'INR');
  payUrl.searchParams.set('tn', `Bill ${invoiceId()}`);
  try {
    const qr = new window.HigherFolioQRCode(0, 0);
    qr.addData(payUrl.toString());
    qr.make();
    const modules = qr.getModuleCount();
    const padding = 4;
    const size = modules + padding * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * 6;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101713';
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (qr.isDark(row, column)) context.fillRect((column + padding) * 6, (row + padding) * 6, 6, 6);
      }
    }
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

function renderPaymentDetails(paid, total) {
  const hasBankDetails = Boolean(businessProfile.bankName || businessProfile.accountName || businessProfile.accountNumber || businessProfile.upiId);
  const hasCryptoDetails = Boolean(businessProfile.cryptoAddress);
  const hasPaymentDetails = hasBankDetails || hasCryptoDetails || Boolean(businessProfile.upiQr);
  $('paymentDetails').hidden = paid || !hasPaymentDetails;
  if (paid || !hasPaymentDetails) {
    $('paymentCryptoNetwork').hidden = true;
    $('paymentCryptoNetwork').textContent = '';
    $('paymentCryptoAddress').hidden = true;
    $('paymentCryptoAddress').textContent = '';
    $('cryptoWarning').hidden = true;
    return;
  }
  const details = [
    ['paymentBankName', businessProfile.bankName, 'Bank: '],
    ['paymentAccountName', businessProfile.accountName, 'Account name: '],
    ['paymentAccountNumber', businessProfile.accountNumber, 'Account / IBAN: '],
    ['paymentUpiId', businessProfile.upiId, 'UPI ID: '],
    ['paymentCryptoNetwork', businessProfile.cryptoNetwork, 'Crypto network: '],
    ['paymentCryptoAddress', businessProfile.cryptoAddress, 'Crypto wallet: ']
  ];
  details.forEach(([id, value, label]) => {
    $(id).hidden = !value;
    $(id).textContent = value ? `${label}${value}` : '';
  });
  $('cryptoWarning').hidden = !hasCryptoDetails;
  const generatedQr = makeUpiQr(total);
  const qr = generatedQr || businessProfile.upiQr || '';
  $('paymentQr').hidden = !qr;
  $('paymentQrImage').src = qr;
  $('paymentQrImage').alt = generatedQr ? `UPI payment QR code for ₹${Number(total).toFixed(2)}` : 'Payment QR code';
  $('paymentQr').querySelector('figcaption').textContent = generatedQr ? `Scan to pay ₹${Number(total).toFixed(2)} via UPI` : 'Scan to pay';
}

function render() {
  const items = itemData();
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const discount = Math.min(Number($('discount').value || 0), subtotal);
  const taxable = subtotal - discount;
  const taxDetails = taxBreakdown(taxable);
  const tax = taxDetails.total;
  const total = taxable + tax;
  $('previewCustomer').textContent = $('customerName').value.trim() || 'Customer name';
  $('previewCustomerContact').textContent = $('customerContact').value.trim() || 'Customer contact';
  const payerAddress = $('customerAddress').value.trim();
  $('previewCustomerAddress').hidden = !payerAddress;
  $('previewCustomerAddress').textContent = payerAddress;
  $('previewDate').textContent = formatDate($('issueDate').value);
  $('documentLabel').textContent = $('documentType').value.toUpperCase();
  const paid = $('paymentStatus').value === 'paid';
  const paymentVia = $('paymentVia').value;
  $('paymentMeta').hidden = !paid || !paymentVia;
  $('previewPayment').textContent = paymentVia;
  $('previewItems').innerHTML = items.length ? items.map(item => `<div class="invoice-row"><span>${escapeHtml(item.description || 'Service')}</span><span>${amount(item.amount)}</span></div>`).join('') : '<div class="invoice-row empty-row"><span>Your service or item</span><span>0.00</span></div>';
  $('subtotal').innerHTML = amount(subtotal);
  $('discountRow').hidden = discount === 0;
  $('discountValue').innerHTML = `− ${amount(discount)}`;
  $('taxRows').innerHTML = taxDetails.rows.map(row => `<div><span>${row.label}</span><strong>${amount(row.amount)}</strong></div>`).join('');
  $('grandTotal').innerHTML = amount(total);
  $('grandTotalLabel').textContent = paid ? 'Total paid' : 'Total due';
  $('invoicePaymentStatus').textContent = paid ? 'Paid' : 'Payment due';
  $('invoicePaymentStatus').className = `invoice-payment-status ${paid ? 'is-paid' : 'is-due'}`;
  renderPaymentDetails(paid, total);
  const note = $('notes').value.trim();
  $('previewNote').hidden = !note;
  $('previewNote').textContent = note;
  $('invoiceNumber').textContent = invoiceId();
  return {items, subtotal, discount, tax, total};
}

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function saveState(message = 'Saved privately on this laptop') { $('saveState').textContent = message; clearTimeout(saveState.timer); saveState.timer = setTimeout(() => $('saveState').textContent = 'Saved privately on this laptop', 2400); }
function billSnapshot() {
  return {
    customerName: $('customerName').value, customerContact: $('customerContact').value, customerAddress: $('customerAddress').value,
    items: itemData(), currency: $('currency').value, issueDate: $('issueDate').value, documentType: $('documentType').value,
    paymentStatus: $('paymentStatus').value, paymentVia: $('paymentVia').value, taxRegion: $('taxRegion').value,
    indiaSupply: $('indiaSupply').value, indiaGstRate: $('indiaGstRate').value, uaeVatType: $('uaeVatType').value,
    discount: $('discount').value, notes: $('notes').value, template
  };
}
function saveBill() {
  if (currentInvoice.saved) { updateSavedInvoice(); saveState('Bill updated — ready to share'); return; }
  const totals = render();
  const records = JSON.parse(localStorage.getItem(appKey) || '[]');
  currentInvoice.julian = julianDay($('issueDate').value);
  records.unshift({number: invoiceId(), invoice: {...currentInvoice}, createdAt: new Date().toISOString(), customer: $('customerName').value.trim(), currency: $('currency').value, total: totals.total, template, documentType: $('documentType').value, paymentStatus: $('paymentStatus').value, paymentVia: $('paymentVia').value, snapshot: billSnapshot()});
  localStorage.setItem(appKey, JSON.stringify(records.slice(0, 100)));
  rememberCurrentCustomer();
  currentInvoice.saved = true;
  nextSequence = currentInvoice.sequence + 1;
  localStorage.setItem('higherFolioNext', String(nextSequence));
  updatePaymentControls(); render(); saveState('Bill saved — ready to share');
}

function addItem() {
  const clone = $('itemTemplate').content.cloneNode(true);
  const row = clone.querySelector('.item-row');
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', render));
  row.querySelector('.remove-item').addEventListener('click', () => { row.remove(); render(); });
  $('additionalItems').append(clone);
  $('additionalItems').lastElementChild.querySelector('input').focus();
}

function openPrint() { render(); document.title = `Higher-Folio-${invoiceId()}`; window.print(); }
function downloadWordCopy() {
  render();
  const styleText = [...document.styleSheets].map(sheet => {
    try { return [...sheet.cssRules].map(rule => rule.cssText).join('\n'); }
    catch { return ''; }
  }).join('\n');
  const title = `${$('documentType').value} ${invoiceId()}`;
  const documentHtml = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${location.href}"><title>${escapeHtml(title)}</title><style>${styleText} body{padding:28px;background:#fff}.invoice{margin:0 auto;box-shadow:none}</style></head><body>${$('invoice').outerHTML}</body></html>`;
  const file = new Blob([documentHtml], {type: 'application/msword'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `${$('documentType').value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${invoiceId()}.doc`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  saveState('Word copy saved — ready to share or edit');
}
async function copyMessage() {
  const customer = $('customerName').value.trim() || 'there';
  const numericTotal = $('grandTotal').textContent.trim();
  const total = $('currency').value === 'AED' ? `AED ${numericTotal}` : `₹ ${numericTotal}`;
  const text = `Hi ${customer}! Your bill ${invoiceId()} for ${total} is ready. Thank you so much!`;
  try { await navigator.clipboard.writeText(text); saveState('Message copied — paste it into Instagram or WhatsApp'); }
  catch { saveState('Your message is ready to copy from the preview'); }
}
function applyBusinessProfile(profile) {
  businessProfile = profile;
  $('businessName').textContent = profile.name || 'My Business';
  $('businessMonogram').textContent = (profile.name || 'M').trim().charAt(0).toUpperCase() || 'M';
  $('businessLogo').hidden = !profile.logo;
  $('businessLogo').src = profile.logo || '';
  $('businessContact').textContent = [profile.contact, profile.instagram].filter(Boolean).join(' · ') || 'Thank you for your business';
  $('businessAddress').hidden = !profile.address;
  $('businessAddress').textContent = profile.address || '';
  $('businessLicense').hidden = !profile.tradeLicense;
  $('businessLicense').textContent = profile.tradeLicense ? `Trade licence no. ${profile.tradeLicense}` : '';
}
function businessId() { return `business-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function readBusinesses() {
  try {
    const saved = JSON.parse(localStorage.getItem(businessesKey) || '[]');
    if (Array.isArray(saved) && saved.length) return saved;
    const legacy = JSON.parse(localStorage.getItem('simplyBillProfile') || 'null');
    if (legacy) {
      const migrated = [{...legacy, id: businessId()}];
      localStorage.setItem(businessesKey, JSON.stringify(migrated));
      localStorage.setItem(activeBusinessKey, migrated[0].id);
      return migrated;
    }
  } catch { return []; }
  return [];
}
function saveBusinesses() { localStorage.setItem(businessesKey, JSON.stringify(businessProfiles)); }
function activeBusiness() { return businessProfiles.find(profile => profile.id === localStorage.getItem(activeBusinessKey)) || businessProfiles[0] || null; }
function renderBusinessPickers() {
  const active = activeBusiness();
  const options = businessProfiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name || 'Untitled business')}</option>`).join('');
  $('businessSwitcher').innerHTML = options;
  $('businessSwitcher').hidden = businessProfiles.length < 2;
  if (active) $('businessSwitcher').value = active.id;
  $('businessProfileControls').hidden = businessProfiles.length < 1;
  $('setupBusinessPicker').innerHTML = options;
  if (editingBusinessId) $('setupBusinessPicker').value = editingBusinessId;
}
function setActiveBusiness(id) {
  const profile = businessProfiles.find(entry => entry.id === id);
  if (!profile) return;
  localStorage.setItem(activeBusinessKey, profile.id);
  editingBusinessId = profile.id;
  applyBusinessProfile(profile); renderBusinessPickers(); render(); renderArchive();
}
function fillBusinessEditor(profile = {}) {
  $('setupBusiness').value = profile.name || '';
  $('setupLogo').value = '';
  pendingLogoData = null;
  $('logoFileName').textContent = profile.logo ? 'A logo is saved on this device. Choose another image to replace it.' : 'Choose a small square logo (up to 750 KB). It stays only on this device.';
  $('removeLogoButton').hidden = !profile.logo;
  $('setupContact').value = profile.contact || '';
  $('setupInstagram').value = profile.instagram || '';
  $('setupBusinessAddress').value = profile.address || '';
  $('setupTradeLicense').value = profile.tradeLicense || '';
  $('setupBankName').value = profile.bankName || '';
  $('setupAccountName').value = profile.accountName || '';
  $('setupAccountNumber').value = profile.accountNumber || '';
  $('setupUpiId').value = profile.upiId || '';
  $('setupCryptoNetwork').value = profile.cryptoNetwork || '';
  $('setupCryptoAddress').value = profile.cryptoAddress || '';
  $('setupQr').value = '';
  pendingQrData = null;
  $('qrFileName').textContent = profile.upiQr ? 'A QR image is saved on this device. Choose another image to replace it.' : 'Choose a small QR image (up to 750 KB). It stays only on this device.';
  $('removeQrButton').hidden = !profile.upiQr;
  $('businessDialogTitle').textContent = profile.id ? `Edit ${profile.name || 'business'}` : 'Add another business';
  $('businessDialogIntro').textContent = profile.id ? 'Update the details that belong only to this business.' : 'Set up separate details for this business. You can switch before making a bill.';
}
function setupBusiness() {
  businessProfiles = readBusinesses();
  const profile = activeBusiness();
  if (profile) { editingBusinessId = profile.id; applyBusinessProfile(profile); renderBusinessPickers(); return; }
  editingBusinessId = null;
  renderBusinessPickers(); fillBusinessEditor(); $('setupDialog').showModal();
}
function editBusiness() {
  businessProfiles = readBusinesses();
  const profile = activeBusiness();
  editingBusinessId = profile?.id || null;
  renderBusinessPickers(); fillBusinessEditor(profile || {});
  $('setupDialog').showModal();
}

function savedCustomers() {
  try { return JSON.parse(localStorage.getItem(customerKey) || '[]'); }
  catch { return []; }
}
function renderSavedCustomers(selectedId = '') {
  const customers = savedCustomers();
  $('savedCustomer').innerHTML = `<option value="">New customer</option>${customers.map(customer => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join('')}`;
  $('savedCustomer').value = selectedId;
}
function rememberCurrentCustomer() {
  const name = $('customerName').value.trim();
  if (!name) return false;
  const details = {name, contact: $('customerContact').value.trim(), address: $('customerAddress').value.trim()};
  const customers = savedCustomers();
  const selectedId = $('savedCustomer').value;
  const existingIndex = customers.findIndex(customer => customer.id === selectedId || customer.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const customer = {...details, id: existingIndex >= 0 ? customers[existingIndex].id : `customer-${Date.now()}-${Math.random().toString(16).slice(2)}`};
  if (existingIndex >= 0) customers[existingIndex] = customer;
  else customers.unshift(customer);
  localStorage.setItem(customerKey, JSON.stringify(customers.slice(0, 100)));
  renderSavedCustomers(customer.id);
  return true;
}
function fillCustomer(id) {
  const customer = savedCustomers().find(entry => entry.id === id);
  if (!customer) return;
  $('customerName').value = customer.name || '';
  $('customerContact').value = customer.contact || '';
  $('customerAddress').value = customer.address || '';
  render(); saveState(`${customer.name} added to this bill`);
}

function selectAppTab(tab) {
  const create = tab === 'create';
  $('createPanel').hidden = !create;
  $('bookkeepingPanel').hidden = create;
  $('mobileActionBar').hidden = !create;
  $('createTab').classList.toggle('selected', create);
  $('bookkeepingTab').classList.toggle('selected', !create);
  $('createTab').setAttribute('aria-selected', String(create));
  $('bookkeepingTab').setAttribute('aria-selected', String(!create));
  if (!create) { renderArchive(); setBookkeepingView(bookkeepingView); }
}

function formatArchiveAmount(currency, value) { return currency === 'INR' ? `₹${Number(value || 0).toFixed(2)}` : `AED ${Number(value || 0).toFixed(2)}`; }
function savedRecords() {
  try { return JSON.parse(localStorage.getItem(appKey) || '[]'); }
  catch { return []; }
}
function savedExpenses() {
  try { return JSON.parse(localStorage.getItem(expensesKey) || '[]'); }
  catch { return []; }
}
function savedVendors() {
  try { return JSON.parse(localStorage.getItem(vendorsKey) || '[]'); }
  catch { return []; }
}
function activeExpenses() { return savedExpenses().filter(expense => expense.businessId === businessProfile.id); }
function renderVendors(selectedId = '') {
  const vendors = savedVendors().filter(vendor => vendor.businessId === businessProfile.id);
  $('expenseVendor').innerHTML = `<option value="">New business or vendor</option>${vendors.map(vendor => `<option value="${escapeHtml(vendor.id)}">${escapeHtml(vendor.name)}</option>`).join('')}`;
  $('expenseVendor').value = selectedId;
}
function renderExpenses() {
  const expenses = activeExpenses();
  $('expenseList').innerHTML = expenses.length ? expenses.map(expense => `<article class="expense-row"><div><strong>${escapeHtml(expense.vendor)}</strong><small>${formatDate(expense.date)}${expense.note ? ` · ${escapeHtml(expense.note)}` : ''}</small></div><div><strong>− ${formatArchiveAmount(expense.currency, expense.amount)}</strong><small>${escapeHtml(expense.method || 'Payment method not specified')}</small></div></article>`).join('') : '<p class="archive-empty">No outgoing payments recorded for this business yet.</p>';
}
function renderCustomerBookkeeping() {
  const customers = savedCustomers();
  $('customerBookkeepingList').innerHTML = customers.length ? customers.map(customer => `<article class="customer-bookkeeping-row"><div><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml([customer.contact, customer.address].filter(Boolean).join(' · ') || 'No contact details saved')}</small></div><button class="button button-secondary" type="button" data-use-customer="${escapeHtml(customer.id)}">Use on a bill</button></article>`).join('') : '<p class="archive-empty">Save a customer on a bill and their details will appear here.</p>';
}
function setBookkeepingView(view) {
  bookkeepingView = view;
  ['overview', 'bills', 'expenses', 'customers'].forEach(name => {
    const selected = name === view;
    $(`${name}View`).hidden = !selected;
    const button = document.querySelector(`[data-bookkeeping-view="${name}"]`);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  if (view === 'bills') renderArchive();
  if (view === 'expenses') { renderVendors(); renderExpenses(); }
  if (view === 'customers') renderCustomerBookkeeping();
}
function renderArchive() {
  const records = savedRecords();
  const filtered = archiveFilter === 'all' ? records : records.filter(record => record.paymentStatus === archiveFilter);
  const dueTotals = records.filter(record => record.paymentStatus !== 'paid').reduce((totals, record) => ({...totals, [record.currency]: (totals[record.currency] || 0) + Number(record.total || 0)}), {});
  const dueValue = Object.entries(dueTotals).map(([currency, total]) => formatArchiveAmount(currency, total)).join(' · ') || '—';
  const expenseTotals = activeExpenses().reduce((totals, expense) => ({...totals, [expense.currency]: (totals[expense.currency] || 0) + Number(expense.amount || 0)}), {});
  const expenseValue = Object.entries(expenseTotals).map(([currency, total]) => formatArchiveAmount(currency, total)).join(' · ') || '—';
  $('archiveSummary').innerHTML = `<div><span>Bills saved</span><strong>${records.length}</strong></div><div><span>Payments due</span><strong>${records.filter(record => record.paymentStatus !== 'paid').length}</strong></div><div><span>Money due</span><strong>${dueValue}</strong></div><div><span>Paid out</span><strong>${expenseValue}</strong></div>`;
  $('bookkeepingCount').hidden = records.length === 0;
  $('bookkeepingCount').textContent = records.length || '';
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('selected', button.dataset.filter === archiveFilter));
  $('archiveList').innerHTML = filtered.length ? filtered.map(record => `<article class="archive-row"><div><strong>${escapeHtml(record.customer || 'Customer')}</strong><small>${escapeHtml(record.documentType || 'Bill')} · ${escapeHtml(record.number)} · ${formatDate(record.snapshot?.issueDate || record.createdAt?.slice(0, 10))}</small><span class="invoice-payment-status ${record.paymentStatus === 'paid' ? 'is-paid' : 'is-due'}">${record.paymentStatus === 'paid' ? 'Paid' : 'Payment due'}</span></div><div class="archive-row-actions"><strong>${formatArchiveAmount(record.currency, record.total)}</strong><button class="button button-secondary" type="button" data-load-bill="${escapeHtml(record.number)}">Open bill</button></div></article>`).join('') : '<p class="archive-empty">No saved bills here yet. Save a completed bill and it will appear here.</p>';
}
function restoreItems(items) {
  $('additionalItems').innerHTML = '';
  const rows = items?.length ? items : [{description: '', amount: ''}];
  $('itemDescription').value = rows[0].description || '';
  $('itemAmount').value = rows[0].amount || '';
  rows.slice(1).forEach(item => {
    addItem();
    const row = $('additionalItems').lastElementChild;
    row.querySelector('input:first-child').value = item.description || '';
    row.querySelector('input[type="number"]').value = item.amount || '';
  });
}
function setTemplate(value) {
  template = value || 'soft';
  document.querySelectorAll('.template-card').forEach(card => {
    const selected = card.dataset.template === template;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
  $('invoice').className = `invoice template-${template}`;
}
function openSavedBill(number) {
  const record = savedRecords().find(entry => entry.number === number);
  if (!record) { saveState('That saved bill is no longer available'); return; }
  const data = record.snapshot;
  if (!data) { saveState('This older bill can be viewed in the archive, but cannot be reopened'); return; }
  $('customerName').value = data.customerName || '';
  $('customerContact').value = data.customerContact || '';
  $('customerAddress').value = data.customerAddress || '';
  $('currency').value = data.currency || 'AED';
  $('issueDate').value = data.issueDate || today;
  $('documentType').value = data.documentType || 'Bill';
  $('paymentStatus').value = data.paymentStatus || 'due';
  $('paymentVia').value = data.paymentVia || '';
  $('taxRegion').value = data.taxRegion || 'none';
  $('indiaSupply').value = data.indiaSupply || 'local';
  $('indiaGstRate').value = data.indiaGstRate || '18';
  $('uaeVatType').value = data.uaeVatType || 'standard';
  $('discount').value = data.discount || '';
  $('notes').value = data.notes || '';
  $('indiaTaxOptions').hidden = $('taxRegion').value !== 'india';
  $('uaeTaxOptions').hidden = $('taxRegion').value !== 'uae';
  restoreItems(data.items);
  setTemplate(data.template);
  currentInvoice = record.invoice ? {...record.invoice, saved: true} : {...createInvoice(nextSequence), saved: true};
  updatePaymentControls(); render(); selectAppTab('create'); saveState(`Opened bill ${record.number}`);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function accountRecord() {
  try { return JSON.parse(localStorage.getItem(accountKey) || 'null'); }
  catch { return null; }
}
function configureAccountDialog(existing) {
  $('accountForm').dataset.mode = existing ? 'unlock' : 'create';
  $('accountTitle').textContent = existing ? `Welcome back${existing.name ? `, ${existing.name}` : ''}` : 'Set up your private account';
  $('accountIntro').textContent = existing ? 'Enter your password to open your saved bills on this browser.' : 'Choose a password to keep Higher Folio behind a local sign-in on this browser.';
  $('accountNameLabel').hidden = existing;
  $('accountName').hidden = existing;
  $('accountConfirmGroup').hidden = existing;
  $('accountConfirm').required = !existing;
  $('accountPassword').autocomplete = existing ? 'current-password' : 'new-password';
  $('accountSubmit').textContent = existing ? 'Unlock Higher Folio' : 'Create private account';
  $('accountError').hidden = true;
  $('accountPassword').value = '';
  $('accountConfirm').value = '';
}
function unlockApplication() {
  sessionStorage.setItem(accountSessionKey, 'true');
  document.body.classList.remove('account-locked');
  $('accountDialog').close();
  setupBusiness(); renderSavedCustomers(); updatePaymentControls(); render(); renderArchive();
}
async function initializeAccount() {
  const account = accountRecord();
  if (account && sessionStorage.getItem(accountSessionKey) === 'true') { unlockApplication(); return; }
  configureAccountDialog(account);
  $('accountDialog').showModal();
  setTimeout(() => $('accountPassword').focus(), 0);
}
async function handleAccountSubmit(event) {
  event.preventDefault();
  const password = $('accountPassword').value;
  const account = accountRecord();
  const isUnlock = $('accountForm').dataset.mode === 'unlock';
  if (password.length < 8) { $('accountError').textContent = 'Use at least 8 characters for the password.'; $('accountError').hidden = false; return; }
  if (!window.argon2) { $('accountError').textContent = 'The local password checker could not load. Please refresh and try again.'; $('accountError').hidden = false; return; }
  $('accountSubmit').disabled = true;
  $('accountSubmit').textContent = isUnlock ? 'Unlocking…' : 'Creating private account…';
  try {
    if (isUnlock) {
      await window.argon2.verify({pass: password, encoded: account.encoded});
      unlockApplication();
      return;
    }
    if (password !== $('accountConfirm').value) throw new Error('Passwords do not match.');
    const result = await window.argon2.hash({pass: password, salt: randomSalt(), time: 3, mem: 19456, hashLen: 32, parallelism: 1, type: window.argon2.ArgonType.Argon2id});
    localStorage.setItem(accountKey, JSON.stringify({name: $('accountName').value.trim(), encoded: result.encoded, createdAt: new Date().toISOString(), version: 1}));
    unlockApplication();
  } catch (error) {
    $('accountError').textContent = error.message === 'Passwords do not match.' ? error.message : (isUnlock ? 'That password did not unlock this local account.' : 'The private account could not be created. Please try again.');
    $('accountError').hidden = false;
    $('accountPassword').focus();
  } finally {
    $('accountSubmit').disabled = false;
    if ($('accountDialog').open) $('accountSubmit').textContent = isUnlock ? 'Unlock Higher Folio' : 'Create private account';
  }
}

document.querySelectorAll('input, select, textarea').forEach(field => field.addEventListener('input', render));
$('currency').addEventListener('change', render);
$('documentType').addEventListener('change', render);
$('taxRegion').addEventListener('change', () => { $('indiaTaxOptions').hidden = $('taxRegion').value !== 'india'; $('uaeTaxOptions').hidden = $('taxRegion').value !== 'uae'; render(); });
['indiaSupply', 'indiaGstRate', 'uaeVatType'].forEach(id => $(id).addEventListener('change', render));
$('paymentStatus').addEventListener('change', () => { updatePaymentControls(); updateSavedInvoice(); render(); });
$('paymentVia').addEventListener('change', () => { updateSavedInvoice(); render(); });
$('addItemButton').addEventListener('click', addItem);
$('moreDetailsButton').addEventListener('click', () => { const open = $('moreDetails').hidden; $('moreDetails').hidden = !open; $('moreDetailsButton').setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('.template-card').forEach(button => button.addEventListener('click', () => { setTemplate(button.dataset.template); render(); }));
$('billForm').addEventListener('submit', event => { event.preventDefault(); if (!$('customerName').value.trim() || !itemData().length) { saveState('Add a customer and at least one item first'); (!$('customerName').value.trim() ? $('customerName') : $('itemDescription')).focus(); return; } saveBill(); });
$('pdfButton').addEventListener('click', openPrint);
$('printButton').addEventListener('click', openPrint);
$('wordButton').addEventListener('click', downloadWordCopy);
$('mobilePdfButton').addEventListener('click', openPrint);
$('copyMessageButton').addEventListener('click', copyMessage);
$('newBillButton').addEventListener('click', () => { $('billForm').reset(); $('issueDate').value = today; $('additionalItems').innerHTML = ''; $('moreDetails').hidden = true; $('moreDetailsButton').setAttribute('aria-expanded', 'false'); $('indiaTaxOptions').hidden = true; $('uaeTaxOptions').hidden = true; currentInvoice = createInvoice(nextSequence); renderSavedCustomers(); updatePaymentControls(); render(); $('customerName').focus(); });
$('markPaidButton').addEventListener('click', () => { $('paymentStatus').value = 'paid'; updatePaymentControls(); updateSavedInvoice(); render(); saveState('Marked as paid — add the payment method if you want'); });
document.querySelectorAll('[data-edit-business]').forEach(button => button.addEventListener('click', editBusiness));
$('businessSwitcher').addEventListener('change', () => setActiveBusiness($('businessSwitcher').value));
$('setupBusinessPicker').addEventListener('change', () => {
  editingBusinessId = $('setupBusinessPicker').value;
  fillBusinessEditor(businessProfiles.find(profile => profile.id === editingBusinessId) || {});
});
$('addBusinessButton').addEventListener('click', () => {
  editingBusinessId = null;
  $('setupBusinessPicker').value = '';
  fillBusinessEditor();
  $('setupBusiness').focus();
});
$('expandPreview').addEventListener('click', openPrint);
$('archiveButton').addEventListener('click', () => { archiveFilter = 'all'; selectAppTab('bookkeeping'); });
$('createTab').addEventListener('click', () => selectAppTab('create'));
$('bookkeepingTab').addEventListener('click', () => selectAppTab('bookkeeping'));
document.querySelectorAll('[data-bookkeeping-view]').forEach(button => button.addEventListener('click', () => setBookkeepingView(button.dataset.bookkeepingView)));
$('recordExpenseButton').addEventListener('click', () => { setBookkeepingView('expenses'); $('expenseVendorName').focus(); });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { archiveFilter = button.dataset.filter; renderArchive(); }));
$('archiveList').addEventListener('click', event => { const button = event.target.closest('[data-load-bill]'); if (button) openSavedBill(button.dataset.loadBill); });
$('customerBookkeepingList').addEventListener('click', event => { const button = event.target.closest('[data-use-customer]'); if (!button) return; selectAppTab('create'); renderSavedCustomers(button.dataset.useCustomer); fillCustomer(button.dataset.useCustomer); $('customerName').focus(); });
$('expenseVendor').addEventListener('change', () => { const vendor = savedVendors().find(entry => entry.id === $('expenseVendor').value); if (vendor) $('expenseVendorName').value = vendor.name; });
$('expenseForm').addEventListener('submit', event => {
  event.preventDefault();
  const vendor = $('expenseVendorName').value.trim();
  const amountValue = Number($('expenseAmount').value);
  if (!vendor || !(amountValue > 0)) { saveState('Add the business paid to and a payment amount'); (!vendor ? $('expenseVendorName') : $('expenseAmount')).focus(); return; }
  const vendors = savedVendors();
  const existing = vendors.find(entry => entry.businessId === businessProfile.id && entry.name.toLocaleLowerCase() === vendor.toLocaleLowerCase());
  const vendorId = existing?.id || `vendor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const expense = {id: `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`, businessId: businessProfile.id, vendor, vendorId, date: $('expenseDate').value || today, currency: $('expenseCurrency').value, amount: amountValue, method: $('expenseMethod').value, note: $('expenseNote').value.trim(), createdAt: new Date().toISOString()};
  try {
    if (!existing) { vendors.unshift({id: vendorId, businessId: businessProfile.id, name: vendor}); localStorage.setItem(vendorsKey, JSON.stringify(vendors.slice(0, 100))); }
    const expenses = savedExpenses(); expenses.unshift(expense); localStorage.setItem(expensesKey, JSON.stringify(expenses.slice(0, 500)));
  } catch { saveState('This outgoing payment could not be saved on this browser'); return; }
  $('expenseForm').reset(); $('expenseDate').value = today; $('expenseCurrency').value = 'AED'; renderVendors(); renderExpenses(); renderArchive(); saveState('Outgoing payment saved privately');
});
$('savedCustomer').addEventListener('change', () => fillCustomer($('savedCustomer').value));
$('saveCustomerButton').addEventListener('click', () => { if (rememberCurrentCustomer()) saveState('Customer details saved for the next bill'); else { saveState('Add the customer name before saving'); $('customerName').focus(); } });
$('accountForm').addEventListener('submit', handleAccountSubmit);
$('accountDialog').addEventListener('cancel', event => event.preventDefault());
$('setupQr').addEventListener('change', () => {
  const file = $('setupQr').files[0];
  pendingQrData = null;
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 750000) {
    $('setupQr').value = '';
    $('qrFileName').textContent = 'Please choose an image under 750 KB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { pendingQrData = String(reader.result); $('qrFileName').textContent = 'QR image ready. It will be saved only on this device.'; };
  reader.onerror = () => { $('qrFileName').textContent = 'That image could not be read. Please choose another one.'; };
  reader.readAsDataURL(file);
});
$('setupLogo').addEventListener('change', () => {
  const file = $('setupLogo').files[0];
  pendingLogoData = null;
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 750000) {
    $('setupLogo').value = '';
    $('logoFileName').textContent = 'Please choose an image under 750 KB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { pendingLogoData = String(reader.result); $('logoFileName').textContent = 'Logo ready. It will be saved only on this device.'; };
  reader.onerror = () => { $('logoFileName').textContent = 'That image could not be read. Please choose another one.'; };
  reader.readAsDataURL(file);
});
$('removeLogoButton').addEventListener('click', () => {
  pendingLogoData = '';
  $('setupLogo').value = '';
  $('removeLogoButton').hidden = true;
  $('logoFileName').textContent = 'The saved logo will be removed when you continue.';
});
$('removeQrButton').addEventListener('click', () => {
  pendingQrData = '';
  $('setupQr').value = '';
  $('removeQrButton').hidden = true;
  $('qrFileName').textContent = 'The saved QR will be removed when you continue.';
});
$('saveSetup').addEventListener('click', () => {
  const name = $('setupBusiness').value.trim() || 'My Business';
  const contact = $('setupContact').value.trim();
  const instagram = $('setupInstagram').value.trim();
  const tradeLicense = $('setupTradeLicense').value.trim();
  const cryptoNetwork = $('setupCryptoNetwork').value;
  const cryptoAddress = $('setupCryptoAddress').value.trim();
  if (cryptoAddress && !cryptoNetwork) { saveState('Choose the crypto network before saving the wallet address'); $('setupCryptoNetwork').focus(); return; }
  const existing = businessProfiles.find(profile => profile.id === editingBusinessId) || {};
  const profile = {id: existing.id || businessId(), name, logo: pendingLogoData !== null ? pendingLogoData : existing.logo || '', contact, instagram, address: $('setupBusinessAddress').value.trim(), tradeLicense, bankName: $('setupBankName').value.trim(), accountName: $('setupAccountName').value.trim(), accountNumber: $('setupAccountNumber').value.trim(), upiId: $('setupUpiId').value.trim(), cryptoNetwork, cryptoAddress, upiQr: pendingQrData !== null ? pendingQrData : existing.upiQr || ''};
  try {
    const index = businessProfiles.findIndex(entry => entry.id === profile.id);
    if (index >= 0) businessProfiles[index] = profile;
    else businessProfiles.push(profile);
    saveBusinesses();
    localStorage.setItem('simplyBillProfile', JSON.stringify(profile));
  }
  catch { saveState('Logo or QR image is too large to save here — please choose a smaller one'); return; }
  editingBusinessId = profile.id;
  setActiveBusiness(profile.id); renderBusinessPickers(); $('setupDialog').close(); saveState('Business details saved privately');
});
initializeAccount();
