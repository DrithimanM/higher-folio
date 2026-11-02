const $ = (id) => document.getElementById(id);
const appKey = 'simply-bill-v1';
let template = 'soft';
let nextSequence = Number(localStorage.getItem('higherFolioNext') || localStorage.getItem('simplyBillNext') || '1');
let businessProfile = {};
let pendingQrData = null;

const symbol = (currency) => currency === 'INR' ? '₹ ' : '<img class="dirham-icon" src="assets/uae-dirham-symbol.png" alt="Dirham" />';
const amount = (number) => `${symbol($('currency').value)}${Number(number || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const localDate = new Date();
const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
$('issueDate').value = today;

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
  localStorage.setItem(appKey, JSON.stringify(records.map(record => record.number === invoiceId() ? {...record, paymentStatus: $('paymentStatus').value, paymentVia: $('paymentVia').value} : record)));
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
  const hasPaymentDetails = hasBankDetails || Boolean(businessProfile.upiQr);
  $('paymentDetails').hidden = paid || !hasPaymentDetails;
  if (paid || !hasPaymentDetails) return;
  const details = [
    ['paymentBankName', businessProfile.bankName, 'Bank: '],
    ['paymentAccountName', businessProfile.accountName, 'Account name: '],
    ['paymentAccountNumber', businessProfile.accountNumber, 'Account / IBAN: '],
    ['paymentUpiId', businessProfile.upiId, 'UPI ID: ']
  ];
  details.forEach(([id, value, label]) => {
    $(id).hidden = !value;
    $(id).textContent = value ? `${label}${value}` : '';
  });
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
function saveBill() {
  if (currentInvoice.saved) { updateSavedInvoice(); saveState('Bill updated — ready to share'); return; }
  const totals = render();
  const records = JSON.parse(localStorage.getItem(appKey) || '[]');
  currentInvoice.julian = julianDay($('issueDate').value);
  records.unshift({number: invoiceId(), createdAt: new Date().toISOString(), customer: $('customerName').value.trim(), currency: $('currency').value, total: totals.total, template, documentType: $('documentType').value, paymentStatus: $('paymentStatus').value, paymentVia: $('paymentVia').value});
  localStorage.setItem(appKey, JSON.stringify(records.slice(0, 100)));
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
  $('businessContact').textContent = [profile.contact, profile.instagram].filter(Boolean).join(' · ') || 'Thank you for your business';
  $('businessAddress').hidden = !profile.address;
  $('businessAddress').textContent = profile.address || '';
  $('businessLicense').hidden = !profile.tradeLicense;
  $('businessLicense').textContent = profile.tradeLicense ? `Trade licence no. ${profile.tradeLicense}` : '';
}
function setupBusiness() {
  const profile = JSON.parse(localStorage.getItem('simplyBillProfile') || 'null');
  if (profile) { applyBusinessProfile(profile); return; }
  $('setupDialog').showModal();
}
function editBusiness() {
  const profile = businessProfile;
  $('setupBusiness').value = profile.name || '';
  $('setupContact').value = profile.contact || '';
  $('setupInstagram').value = profile.instagram || '';
  $('setupBusinessAddress').value = profile.address || '';
  $('setupTradeLicense').value = profile.tradeLicense || '';
  $('setupBankName').value = profile.bankName || '';
  $('setupAccountName').value = profile.accountName || '';
  $('setupAccountNumber').value = profile.accountNumber || '';
  $('setupUpiId').value = profile.upiId || '';
  $('setupQr').value = '';
  pendingQrData = null;
  $('qrFileName').textContent = profile.upiQr ? 'A QR image is saved on this device. Choose another image to replace it.' : 'Choose a small QR image (up to 750 KB). It stays only on this device.';
  $('removeQrButton').hidden = !profile.upiQr;
  $('setupDialog').showModal();
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
document.querySelectorAll('.template-card').forEach(button => button.addEventListener('click', () => { template = button.dataset.template; document.querySelectorAll('.template-card').forEach(card => { const selected = card === button; card.classList.toggle('selected', selected); card.setAttribute('aria-checked', String(selected)); }); $('invoice').className = `invoice template-${template}`; render(); }));
$('billForm').addEventListener('submit', event => { event.preventDefault(); if (!$('customerName').value.trim() || !itemData().length) { saveState('Add a customer and at least one item first'); (!$('customerName').value.trim() ? $('customerName') : $('itemDescription')).focus(); return; } saveBill(); });
$('pdfButton').addEventListener('click', openPrint);
$('printButton').addEventListener('click', openPrint);
$('wordButton').addEventListener('click', downloadWordCopy);
$('mobilePdfButton').addEventListener('click', openPrint);
$('copyMessageButton').addEventListener('click', copyMessage);
$('newBillButton').addEventListener('click', () => { $('billForm').reset(); $('issueDate').value = today; $('additionalItems').innerHTML = ''; $('moreDetails').hidden = true; $('moreDetailsButton').setAttribute('aria-expanded', 'false'); $('indiaTaxOptions').hidden = true; $('uaeTaxOptions').hidden = true; currentInvoice = createInvoice(nextSequence); updatePaymentControls(); render(); $('customerName').focus(); });
$('markPaidButton').addEventListener('click', () => { $('paymentStatus').value = 'paid'; updatePaymentControls(); updateSavedInvoice(); render(); saveState('Marked as paid — add the payment method if you want'); });
document.querySelectorAll('[data-edit-business]').forEach(button => button.addEventListener('click', editBusiness));
$('expandPreview').addEventListener('click', openPrint);
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
  const profile = {name, contact, instagram, address: $('setupBusinessAddress').value.trim(), tradeLicense, bankName: $('setupBankName').value.trim(), accountName: $('setupAccountName').value.trim(), accountNumber: $('setupAccountNumber').value.trim(), upiId: $('setupUpiId').value.trim(), upiQr: pendingQrData !== null ? pendingQrData : businessProfile.upiQr || ''};
  try { localStorage.setItem('simplyBillProfile', JSON.stringify(profile)); }
  catch { saveState('QR image is too large to save here — please choose a smaller one'); return; }
  applyBusinessProfile(profile); render(); $('setupDialog').close(); saveState('Business and payment details saved privately');
});
setupBusiness(); updatePaymentControls(); render();
