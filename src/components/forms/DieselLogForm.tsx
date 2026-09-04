import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DieselLog, DieselProcurementType } from '../../types';
import {
  Fuel,
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  FileText,
  ShieldCheck,
  ArrowLeft,
  Check,
  Lock,
  ClipboardList,
  Upload
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';

interface DieselLogFormProps {
  onBack?: () => void;
  onSuccess?: () => void;
  initialMode?: 'form' | 'approval' | 'pod' | 'mail-logs';
  selectedLogId?: string;
}

const STATUS_BADGE: Record<string, string> = {
  'Pending Admin Approval': 'bg-amber-100 text-amber-800',
  'Approved': 'bg-emerald-100 text-emerald-800',
  'Rejected': 'bg-rose-100 text-rose-800',
  'Payment Processing': 'bg-sky-100 text-sky-800',
  'Completed': 'bg-emerald-100 text-emerald-800',
  'Ready for Delivery': 'bg-indigo-100 text-indigo-800',
  'Pending Validation': 'bg-amber-100 text-amber-800',
  'Delivery Completed': 'bg-emerald-100 text-emerald-800',
  'Partial Delivery': 'bg-amber-100 text-amber-800',
  'Not Delivered': 'bg-rose-100 text-rose-800'
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-700'}`}>
    {status}
  </span>
);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const DieselLogForm: React.FC<DieselLogFormProps> = ({ onBack, onSuccess, initialMode = 'form', selectedLogId }) => {
  const {
    currentUser,
    warehouses,
    selectedWarehouseId,
    dieselLogs,
    vendors,
    submitDieselProcurement,
    approveDieselLog,
    rejectDieselLog,
    validateDelivery,
    deleteDieselLog,
    notify
  } = useApp();

  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'SERVICE_ADMIN' || currentUser.role === 'WAREHOUSE_ADMIN';
  // Admins only ever have the Approvals tab. POCs land on My Requests when arriving via a
  // "POD"/"validate" shortcut (e.g. the ledger's Upload POD button) instead of always the
  // New Requisition form — that mismatch used to strand POCs on the wrong screen.
  const [activeTab, setActiveTab] = useState<'form' | 'myRequests' | 'approval'>(
    isAdmin ? 'approval' : (initialMode === 'pod' || initialMode === 'approval') ? 'myRequests' : 'form'
  );

  // ---- Role-based auto-filled fields (spec section 3) — read-only for POCs ----
  const activeWh = warehouses.find(w => w.id === (currentUser.warehouseId || selectedWarehouseId)) || warehouses[0];
  const derivedEntity: 'B2B' | 'B2C' = activeWh?.channel === 'B2C' ? 'B2C' : 'B2B';
  const warehouseDisplayName = derivedEntity === 'B2C' ? (activeWh?.b2cName || activeWh?.name) : (activeWh?.b2bName || activeWh?.name);
  const costCenterDisplay = activeWh?.costCenter || activeWh?.sapCode || '—';
  const zoneDisplay = activeWh?.zone || '—';

  // ---- New Requisition form state ----
  const [fuel, setFuel] = useState<'Diesel' | 'DEF'>('Diesel');
  const [type, setType] = useState<DieselProcurementType | ''>('');
  const [vendorPaymentSelect, setVendorPaymentSelect] = useState('');
  const [vendorPaymentOther, setVendorPaymentOther] = useState('');
  const [vendorDeliverySelect, setVendorDeliverySelect] = useState('');
  const [vendorDeliveryOther, setVendorDeliveryOther] = useState('');
  const [orderQuantity, setOrderQuantity] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [qrImage, setQrImage] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ uniqueId: string } | null>(null);

  const paymentVendors = vendors.filter(v => v.isActive && (v.vendorType === 'Payment' || v.vendorType === 'Both'));
  const deliveryVendors = vendors.filter(v => v.isActive && (v.vendorType === 'Delivery' || v.vendorType === 'Both'));

  // One quantity box per type — Delivery Only's single "Order Quantity" input doubles as the
  // amount-calc quantity (both master-sheet columns get the same value); Payment Only just has "Quantity".
  const effectiveQuantity = type === 'Delivery Only' ? orderQuantity : quantity;

  const finalAmount = useMemo(() => {
    const q = Number(effectiveQuantity) || 0;
    const r = Number(rate) || 0;
    return Math.round(q * r * 100) / 100;
  }, [effectiveQuantity, rate]);

  const resetForm = () => {
    setFuel('Diesel');
    setType('');
    setVendorPaymentSelect('');
    setVendorPaymentOther('');
    setVendorDeliverySelect('');
    setVendorDeliveryOther('');
    setOrderQuantity('');
    setQuantity('');
    setRate('');
    setQrImage('');
    setFormError(null);
    setSubmitted(null);
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrImage(await fileToDataUrl(file));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!type) {
      setFormError('Please select procurement type.');
      return;
    }
    const vendorPaymentFinal = vendorPaymentSelect === 'Other' ? vendorPaymentOther.trim() : vendorPaymentSelect;
    const vendorDeliveryFinal = vendorDeliverySelect === 'Other' ? vendorDeliveryOther.trim() : vendorDeliverySelect;

    if (type === 'Payment Only' && !vendorPaymentFinal) {
      setFormError('Please select a payment vendor.');
      return;
    }
    if (type === 'Delivery Only' && !vendorDeliveryFinal) {
      setFormError('Please select a delivery vendor.');
      return;
    }
    if (type === 'Delivery Only' && !(Number(orderQuantity) > 0)) {
      setFormError('Please enter the order quantity.');
      return;
    }
    if (!(Number(effectiveQuantity) > 0) || !(Number(rate) > 0)) {
      setFormError('Please enter a valid quantity/rate.');
      return;
    }
    // QR Code Image is only required for Payment Only (no physical delivery to inspect instead) — rule addition.
    if (type === 'Payment Only' && !qrImage) {
      setFormError('Please upload the QR code image.');
      return;
    }

    setIsSubmitting(true);
    const result = submitDieselProcurement({
      emailAddress: currentUser.email,
      entity: derivedEntity,
      whNameB2B: activeWh?.b2bName || activeWh?.name || '',
      whNameB2C: activeWh?.b2cName || activeWh?.name || '',
      costCenter: costCenterDisplay,
      zone: zoneDisplay,
      warehouseId: activeWh?.id || '',
      fuel,
      type,
      vendorNamePayment: type === 'Payment Only' ? vendorPaymentFinal : undefined,
      vendorNameDelivery: type === 'Delivery Only' ? vendorDeliveryFinal : undefined,
      quantity: Number(effectiveQuantity),
      orderQuantityLitres: type === 'Delivery Only' ? Number(orderQuantity) : undefined,
      ratePerLitre: Number(rate),
      qrCodeImageUrl: type === 'Payment Only' ? qrImage : undefined
    });
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message);
      return;
    }
    setSubmitted({ uniqueId: result.uniqueId! });
    notify('success', `Requisition [${result.uniqueId}] submitted`, 'Pending Admin Approval.');
  };

  // ---- My Requests (POC) ----
  const myRequests = dieselLogs.filter(l => l.submittedById === currentUser.id);
  const [validatingLog, setValidatingLog] = useState<DieselLog | null>(() => {
    if (initialMode === 'pod' && selectedLogId) {
      return dieselLogs.find(l => l.id === selectedLogId && l.status === 'Ready for Delivery') || null;
    }
    return null;
  });
  const [deletingLog, setDeletingLog] = useState<DieselLog | null>(null);

  const handleDeleteConfirm = () => {
    if (!deletingLog) return;
    deleteDieselLog(deletingLog.id);
    setDeletingLog(null);
  };

  // ---- Admin approvals ----
  const pendingLogs = dieselLogs.filter(l => l.status === 'Pending Admin Approval');
  const [rejectModalLog, setRejectModalLog] = useState<DieselLog | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = (log: DieselLog) => {
    const res = approveDieselLog(log.id);
    if (res.success) notify('success', `[${log.uniqueId}] Approved`, res.message);
    else notify('error', 'Could not approve', res.message);
  };

  const handleRejectConfirm = () => {
    if (!rejectModalLog) return;
    if (!rejectReason.trim()) {
      notify('warning', 'Rejection reason required', 'Please enter a rejection reason.');
      return;
    }
    const res = rejectDieselLog(rejectModalLog.id, rejectReason.trim());
    if (res.success) {
      notify('warning', `[${rejectModalLog.uniqueId}] Rejected`, res.message);
      setRejectModalLog(null);
      setRejectReason('');
    } else {
      notify('error', 'Could not reject', res.message);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      <PageHeader
        title="Diesel Procurement"
        description="Requisition, approval, delivery validation, and audit for ZHPL fuel procurement."
        icon={Fuel}
        actions={
          onBack ? (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : undefined
        }
      />

      {/* Tabs — role-gated (rule #25: POCs never see approvals) */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1.5 shadow-xs overflow-x-auto gap-1">
        {!isAdmin && (
          <>
            <button
              onClick={() => setActiveTab('form')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${activeTab === 'form' ? 'bg-rose-50 text-rose-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <FileText className="w-4 h-4" /> New Requisition
            </button>
            <button
              onClick={() => setActiveTab('myRequests')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${activeTab === 'myRequests' ? 'bg-rose-50 text-rose-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <ClipboardList className="w-4 h-4" /> My Requests ({myRequests.length})
            </button>
          </>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('approval')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${activeTab === 'approval' ? 'bg-rose-50 text-rose-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <ShieldCheck className="w-4 h-4" /> Pending Approvals
            {pendingLogs.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">{pendingLogs.length}</span>
            )}
          </button>
        )}
      </div>

      {/* ================= POC: NEW REQUISITION ================= */}
      {!isAdmin && activeTab === 'form' && (
        <div className="max-w-2xl mx-auto space-y-4">
          {submitted ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-t-8 border-t-rose-600 p-7 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Requisition submitted</h2>
              <p className="text-sm text-slate-600">
                Your request <strong className="font-mono text-rose-700">{submitted.uniqueId}</strong> is now <StatusBadge status="Pending Admin Approval" />.
              </p>
              <button onClick={resetForm} className="text-sm font-semibold text-rose-700 hover:underline cursor-pointer">
                + Submit another requisition
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Auto-filled, read-only role-based fields */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" /> Your details (auto-filled, read-only)
                </h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-slate-400 block">Email Address</span><span className="font-semibold text-slate-800">{currentUser.email}</span></div>
                  <div><span className="text-slate-400 block">Entity</span><span className="font-semibold text-slate-800">{derivedEntity}</span></div>
                  <div><span className="text-slate-400 block">Warehouse</span><span className="font-semibold text-slate-800">{warehouseDisplayName}</span></div>
                  <div><span className="text-slate-400 block">Cost Center / SAP Code</span><span className="font-semibold text-slate-800 font-mono">{costCenterDisplay}</span></div>
                  <div><span className="text-slate-400 block">Zone</span><span className="font-semibold text-slate-800">{zoneDisplay}</span></div>
                </div>
              </div>

              {/* Fuel + Type */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Fuel <span className="text-rose-600">*</span></label>
                  <select value={fuel} onChange={e => setFuel(e.target.value as 'Diesel' | 'DEF')} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rose-500">
                    <option value="Diesel">Diesel</option>
                    <option value="DEF">DEF</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Type <span className="text-rose-600">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setType('Delivery Only')} className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${type === 'Delivery Only' ? 'border-rose-600 bg-rose-50/60 text-rose-950 font-bold' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      <div className="text-sm font-semibold">Delivery Only</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">DZHPLxxxx</div>
                    </button>
                    <button type="button" onClick={() => setType('Payment Only')} className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${type === 'Payment Only' ? 'border-rose-600 bg-rose-50/60 text-rose-950 font-bold' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      <div className="text-sm font-semibold">Payment Only</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">PZHPLxxxx</div>
                    </button>
                  </div>
                </div>

                {/* Conditional: Payment Only — vendor, quantity, and QR (mandatory: no physical
                    delivery to inspect instead, so the QR/payment proof is the only record). */}
                {type === 'Payment Only' && (
                  <div className="space-y-4 pt-2 border-t border-slate-100 animate-fade-in-up">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Vendor Name (Payment) <span className="text-rose-600">*</span></label>
                      <select value={vendorPaymentSelect} onChange={e => setVendorPaymentSelect(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                        <option value="">Select vendor…</option>
                        {paymentVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        <option value="Other">Other</option>
                      </select>
                      {vendorPaymentSelect === 'Other' && (
                        <input value={vendorPaymentOther} onChange={e => setVendorPaymentOther(e.target.value)} placeholder="Enter vendor name" className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm mt-1.5" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Quantity (Litres) <span className="text-rose-600">*</span></label>
                      <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono" placeholder="e.g. 1500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">QR Code Image <span className="text-rose-600">*</span></label>
                      <label className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-100 transition">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-500">{qrImage ? 'Image attached ✓' : 'Tap to upload or capture'}</span>
                        <input type="file" accept="image/*" capture="environment" onChange={handleQrUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}

                {/* Conditional: Delivery Only — vendor + one quantity box (Order Quantity),
                    no QR (there's a physical delivery + POD to verify instead). */}
                {type === 'Delivery Only' && (
                  <div className="space-y-4 pt-2 border-t border-slate-100 animate-fade-in-up">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Vendor Name (Delivery) <span className="text-rose-600">*</span></label>
                      <select value={vendorDeliverySelect} onChange={e => setVendorDeliverySelect(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                        <option value="">Select vendor…</option>
                        {deliveryVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        <option value="Other">Other</option>
                      </select>
                      {vendorDeliverySelect === 'Other' && (
                        <input value={vendorDeliveryOther} onChange={e => setVendorDeliveryOther(e.target.value)} placeholder="Enter delivery vendor name" className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm mt-1.5" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Order Quantity (Litres) <span className="text-rose-600">*</span></label>
                      <input type="number" min={1} value={orderQuantity} onChange={e => setOrderQuantity(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono" placeholder="e.g. 2000" />
                    </div>
                  </div>
                )}

                {/* Common: Rate per Litre */}
                {type && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Rate per Litre (₹) <span className="text-rose-600">*</span></label>
                      <input type="number" min={0.01} step={0.01} value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono" placeholder="e.g. 89.80" />
                    </div>
                  </div>
                )}

                {type && (
                  <div className="bg-slate-900 text-white rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-rose-300 uppercase tracking-wider font-semibold">Final Amount (system-calculated)</div>
                      <div className="text-2xl font-bold font-mono">₹{finalAmount.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="text-xs text-slate-300 font-mono">{Number(effectiveQuantity) || 0} L × ₹{Number(rate) || 0}/L</div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 text-sm text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {formError}
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-md transition-all cursor-pointer">
                {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit Requisition</>}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ================= POC: MY REQUESTS ================= */}
      {!isAdmin && activeTab === 'myRequests' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: myRequests.length },
              { label: 'Pending Approval', value: myRequests.filter(l => l.status === 'Pending Admin Approval').length },
              { label: 'Ready for Delivery', value: myRequests.filter(l => l.status === 'Ready for Delivery').length },
              { label: 'Delivery Completed', value: myRequests.filter(l => l.status === 'Delivery Completed').length }
            ].map(c => (
              <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="text-2xl font-bold text-slate-900">{c.value}</div>
                <div className="text-[11px] text-slate-500 font-semibold uppercase">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {myRequests.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No requisitions yet.</div>
            ) : myRequests.map(log => (
              <div key={log.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded">{log.uniqueId}</span>
                    <StatusBadge status={log.status} />
                  </div>
                  <div className="text-sm text-slate-700 mt-1">{log.type} · ₹{log.finalAmount.toLocaleString('en-IN')}</div>
                  {log.status === 'Rejected' && log.rejectionReason && (
                    <div className="text-xs text-rose-600 mt-1">Reason: {log.rejectionReason}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {log.status === 'Ready for Delivery' && (
                    <button onClick={() => setValidatingLog(log)} className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer">
                      Validate Delivery
                    </button>
                  )}
                  {/* Wrong/mistaken submission — deletable only before it's gone anywhere */}
                  {(log.status === 'Pending Admin Approval' || log.status === 'Rejected') && (
                    <button onClick={() => setDeletingLog(log)} className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= ADMIN: PENDING APPROVALS ================= */}
      {isAdmin && activeTab === 'approval' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-600" /> Pending Approvals ({pendingLogs.length})
          </h2>
          {pendingLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Nothing waiting on your review.</div>
          ) : (
            <div className="space-y-3">
              {pendingLogs.map(log => (
                <div key={log.id} className="p-4 rounded-xl border-2 border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-mono font-bold text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded">{log.uniqueId}</span>
                      <span className="ml-2 font-semibold text-slate-900 text-sm">{log.whNameB2B}</span>
                      <span className="ml-2 text-xs text-slate-500">{log.type} · {log.emailAddress}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">₹{log.finalAmount.toLocaleString('en-IN')}</span>
                      {/* Exactly two decision options (rule #23) */}
                      <button onClick={() => setRejectModalLog(log)} className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer">
                        Reject
                      </button>
                      <button onClick={() => handleApprove(log)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject reason modal (rule #24: mandatory) */}
      {rejectModalLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900">Reject [{rejectModalLog.uniqueId}]</h3>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Rejection reason (required)…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectModalLog(null); setRejectReason(''); }} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancel</button>
              <button onClick={handleRejectConfirm} className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation (POC's own mistaken requisition, before it's gone anywhere) */}
      {deletingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900">Delete [{deletingLog.uniqueId}]?</h3>
            <p className="text-sm text-slate-600">This permanently removes the requisition. This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingLog(null)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancel</button>
              <button onClick={handleDeleteConfirm} className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery validation modal (POC) — Validation auto-derived from quantity (rule #18), POD mandatory (rule #30) */}
      {validatingLog && (
        <ValidateDeliveryModal
          log={validatingLog}
          onClose={() => setValidatingLog(null)}
          onSubmit={(payload) => {
            const res = validateDelivery(validatingLog.id, payload);
            if (res.success) {
              notify('success', 'Delivery validated', res.message);
              setValidatingLog(null);
              onSuccess?.();
            } else {
              notify('error', 'Could not validate', res.message);
            }
          }}
        />
      )}
    </div>
  );
};

const ValidateDeliveryModal: React.FC<{
  log: DieselLog;
  onClose: () => void;
  onSubmit: (payload: { validation: 'Delivered' | 'Partial Delivered' | 'Not Delivered'; deliveredQuantityLitres: number; podUrl: string; notes?: string }) => void;
}> = ({ log, onClose, onSubmit }) => {
  const orderedQty = log.orderQuantityLitres || 0;
  const [deliveredQty, setDeliveredQty] = useState<number | ''>(orderedQty);
  const [podUrl, setPodUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const derivedValidation: 'Delivered' | 'Partial Delivered' | 'Not Delivered' =
    Number(deliveredQty) === 0 ? 'Not Delivered' : Number(deliveredQty) >= orderedQty ? 'Delivered' : 'Partial Delivered';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPodUrl(await fileToDataUrl(file));
  };

  const handleSubmit = () => {
    if (!podUrl) {
      setError('Please upload POD before completing the delivery validation.');
      return;
    }
    onSubmit({ validation: derivedValidation, deliveredQuantityLitres: Number(deliveredQty) || 0, podUrl, notes: notes || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Validate Delivery — {log.uniqueId}</h3>
        <div className="text-xs text-slate-500">Ordered: <strong className="font-mono text-slate-800">{orderedQty} L</strong></div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Delivered Quantity (Litres) <span className="text-rose-600">*</span></label>
          <input type="number" min={0} max={orderedQty} value={deliveredQty} onChange={e => setDeliveredQty(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Validation</label>
          <StatusBadge status={derivedValidation} />
          <p className="text-[11px] text-slate-400">Derived automatically from the quantity above — partial delivery is a normal business outcome, not an error.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">POD — Proof of Delivery <span className="text-rose-600">*</span></label>
          <label className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-100">
            <Upload className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">{podUrl ? 'POD attached ✓' : 'Tap to capture or upload'}</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Remarks (optional)…" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />

        {error && <div className="text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer">Submit Validation</button>
        </div>
      </div>
    </div>
  );
};
