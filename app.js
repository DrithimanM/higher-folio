const $ = (id) => document.getElementById(id);
const appKey = 'simply-bill-v1';
let template = 'soft';
let nextSequence = Number(localStorage.getItem('higherFolioNext') || localStorage.getItem('simplyBillNext') || '1');

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

function render() {
  const items = itemData();
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const discount = Math.min(Number($('discount').value || 0), subtotal);
  const taxPercent = Number($('tax').value || 0);
  const taxable = subtotal - discount;
  const tax = taxable * taxPercent / 100;
  const total = taxable + tax;
  $('previewCustomer').textContent = $('customerName').value.trim() || 'Customer name';
  $('previewCustomerContact').textContent = $('customerContact').value.trim() || 'Customer contact';
  const payerAddress = $('customerAddress').value.trim();
  $('previewCustomerAddress').hidden = !payerAddress;
  $('previewCustomerAddress').textContent = payerAddress;
  $('previewDate').textContent = formatDate($('issueDate').value);
  const paymentVia = $('paymentVia').value;
  $('paymentMeta').hidden = !paymentVia;
  $('previewPayment').textContent = paymentVia;
  $('previewItems').innerHTML = items.length ? items.map(item => `<div class="invoice-row"><span>${escapeHtml(item.description || 'Service')}</span><span>${amount(item.amount)}</span></div>`).join('') : '<div class="invoice-row empty-row"><span>Your service or item</span><span>0.00</span></div>';
  $('subtotal').innerHTML = amount(subtotal);
  $('discountRow').hidden = discount === 0;
  $('discountValue').innerHTML = `− ${amount(discount)}`;
  $('taxRow').hidden = tax === 0;
  $('taxLabel').textContent = `${taxPercent}% tax`;
  $('taxValue').innerHTML = amount(tax);
  $('grandTotal').innerHTML = amount(total);
  const note = $('notes').value.trim();
  $('previewNote').hidden = !note;
  $('previewNote').textContent = note;
  $('invoiceNumber').textContent = invoiceId();
  return {items, subtotal, discount, taxPercent, tax, total};
}

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function saveState(message = 'Saved privately on this laptop') { $('saveState').textContent = message; clearTimeout(saveState.timer); saveState.timer = setTimeout(() => $('saveState').textContent = 'Saved privately on this laptop', 2400); }
function saveBill() {
  if (currentInvoice.saved) { saveState('This bill is already saved — ready to share'); return; }
  const totals = render();
  const records = JSON.parse(localStorage.getItem(appKey) || '[]');
  currentInvoice.julian = julianDay($('issueDate').value);
  records.unshift({number: invoiceId(), createdAt: new Date().toISOString(), customer: $('customerName').value.trim(), currency: $('currency').value, total: totals.total, template});
  localStorage.setItem(appKey, JSON.stringify(records.slice(0, 100)));
  currentInvoice.saved = true;
  nextSequence = currentInvoice.sequence + 1;
  localStorage.setItem('higherFolioNext', String(nextSequence));
  render(); saveState('Bill saved — ready to share');
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
async function copyMessage() {
  const customer = $('customerName').value.trim() || 'there';
  const numericTotal = $('grandTotal').textContent.trim();
  const total = $('currency').value === 'AED' ? `AED ${numericTotal}` : `₹ ${numericTotal}`;
  const text = `Hi ${customer}! Your bill ${invoiceId()} for ${total} is ready. Thank you so much!`;
  try { await navigator.clipboard.writeText(text); saveState('Message copied — paste it into Instagram or WhatsApp'); }
  catch { saveState('Your message is ready to copy from the preview'); }
}
function applyBusinessProfile(profile) {
  $('businessName').textContent = profile.name || 'My Business';
  $('businessContact').textContent = [profile.contact, profile.instagram].filter(Boolean).join(' · ') || 'Thank you for your business';
  $('businessLicense').hidden = !profile.tradeLicense;
  $('businessLicense').textContent = profile.tradeLicense ? `Trade licence no. ${profile.tradeLicense}` : '';
}
function setupBusiness() {
  const profile = JSON.parse(localStorage.getItem('simplyBillProfile') || 'null');
  if (profile) { applyBusinessProfile(profile); return; }
  $('setupDialog').showModal();
}
function editBusiness() {
  const profile = JSON.parse(localStorage.getItem('simplyBillProfile') || '{}');
  $('setupBusiness').value = profile.name || '';
  $('setupContact').value = profile.contact || '';
  $('setupInstagram').value = profile.instagram || '';
  $('setupTradeLicense').value = profile.tradeLicense || '';
  $('setupDialog').showModal();
}

document.querySelectorAll('input, select, textarea').forEach(field => field.addEventListener('input', render));
$('currency').addEventListener('change', render);
$('addItemButton').addEventListener('click', addItem);
$('moreDetailsButton').addEventListener('click', () => { const open = $('moreDetails').hidden; $('moreDetails').hidden = !open; $('moreDetailsButton').setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('.template-card').forEach(button => button.addEventListener('click', () => { template = button.dataset.template; document.querySelectorAll('.template-card').forEach(card => { const selected = card === button; card.classList.toggle('selected', selected); card.setAttribute('aria-checked', String(selected)); }); $('invoice').className = `invoice template-${template}`; render(); }));
$('billForm').addEventListener('submit', event => { event.preventDefault(); if (!$('customerName').value.trim() || !itemData().length) { saveState('Add a customer and at least one item first'); (!$('customerName').value.trim() ? $('customerName') : $('itemDescription')).focus(); return; } saveBill(); });
$('pdfButton').addEventListener('click', openPrint);
$('mobilePdfButton').addEventListener('click', openPrint);
$('copyMessageButton').addEventListener('click', copyMessage);
$('newBillButton').addEventListener('click', () => { $('billForm').reset(); $('issueDate').value = today; $('additionalItems').innerHTML = ''; $('moreDetails').hidden = true; $('moreDetailsButton').setAttribute('aria-expanded', 'false'); currentInvoice = createInvoice(nextSequence); render(); $('customerName').focus(); });
$('editBusinessButton').addEventListener('click', editBusiness);
$('expandPreview').addEventListener('click', openPrint);
$('saveSetup').addEventListener('click', () => { const name = $('setupBusiness').value.trim() || 'My Business'; const contact = $('setupContact').value.trim(); const instagram = $('setupInstagram').value.trim(); const tradeLicense = $('setupTradeLicense').value.trim(); const profile = {name, contact, instagram, tradeLicense}; localStorage.setItem('simplyBillProfile', JSON.stringify(profile)); applyBusinessProfile(profile); $('setupDialog').close(); });
setupBusiness(); render();
