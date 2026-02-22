import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Trash2, Wallet, Users, History, Calendar, Filter, Cloud, CloudOff, Pencil, FileText, BarChart3 } from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

// Utility to format currency
const formatMoney = (amount) => {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(amount);
};

// Utility to format time in Venezuela timezone (UTC-4)
const formatVenezuelaTime = (isoTimestamp) => {
  const date = new Date(isoTimestamp);
  // Convert UTC to Venezuela time (UTC-4)
  const venezuelaDate = new Date(date.getTime() - (4 * 60 * 60 * 1000));
  return venezuelaDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

const formatVenezuelaDate = (isoTimestamp) => {
  const date = new Date(isoTimestamp);
  const venezuelaDate = new Date(date.getTime() - (4 * 60 * 60 * 1000));
  return venezuelaDate.toLocaleDateString('es-VE', { timeZone: 'UTC' });
};

// Helper: Get YYYY-MM-DD in Venezuela Time (UTC-4)
// Used for filtering and default date inputs
const getVenezuelaDateISO = (isoTimestamp) => {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date();
  // Shift 4 hours back to get Venezuela "Visual" Date
  const venezuelaDate = new Date(date.getTime() - (4 * 60 * 60 * 1000));
  // Return the ISO date part (which is now effectively the Vzla date because we shifted the time)
  return venezuelaDate.toISOString().split('T')[0];
};

// Main Component
function App() {
  const [payments, setPayments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 1. Sync Payments from Firebase
  useEffect(() => {
    const q = query(collection(db, 'payments'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPayments(ps);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // 2. Sync Agents from Firebase
  useEffect(() => {
    const q = query(collection(db, 'agents'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const as = snapshot.docs.map(doc => doc.data().name);
      if (as.length > 0) {
        setAgents(as);
      } else {
        // Fallback defaults if Firestore collection is empty
        setAgents([
          'Agente 0',
          'Agente 1(chiru, Finlay, tiam, 156 )',
          'Agente 2 ( Madaly,Rous,Dasha, 108)',
          'Agente 4',
          'Agente 6',
          'Agente 7',
          'Agente 8',
          'Agente 9',
          'Agente 10',
          'Liam',
          'Teffy y Ceci',
          'Agente Herlan'
        ]);
      }
    });
    return unsubscribe;
  }, [loading]);

  // 3. Fetch Exchange Rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares');
        const data = await response.json();
        const bcvRate = data.find(r => r.fuente === 'oficial')?.promedio || 0;
        const parallelRate = data.find(r => r.fuente === 'paralelo')?.promedio || 0;
        setExchangeRates({ bcv: bcvRate, paralelo: parallelRate, loading: false });
      } catch (err) {
        console.error('Error fetching rates:', err);
        setExchangeRates(prev => ({ ...prev, loading: false }));
      }
    };
    fetchRates();
  }, []);

  const [form, setForm] = useState({ agent: '', amount: '', reference: '', date: getVenezuelaDateISO() });
  const [exchangeRates, setExchangeRates] = useState({ bcv: 0, paralelo: 0, loading: true });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Date Range for Stats
  const [statsStartDate, setStatsStartDate] = useState(() => {
    const date = new Date();
    // Shift -7 days then get Vzla Date
    date.setDate(date.getDate() - 7);
    return getVenezuelaDateISO(date.toISOString());
  });
  const [statsEndDate, setStatsEndDate] = useState(() => {
    return getVenezuelaDateISO();
  });

  // New States for Filtering
  const [globalFilterDate, setGlobalFilterDate] = useState(() => {
    return getVenezuelaDateISO();
  });
  const [historySearch, setHistorySearch] = useState('');
  const [summarySearch, setSummarySearch] = useState('');

  // 1. First Layer: Filter ALL payments by DATE (Compared in Venezuela Time)
  const paymentsByDate = useMemo(() => {
    if (!globalFilterDate) return payments;
    return payments.filter(p => {
      // Convert payment timestamp to Venezuela YYYY-MM-DD
      const paymentDateISO = getVenezuelaDateISO(p.timestamp);
      return paymentDateISO === globalFilterDate;
    });
  }, [payments, globalFilterDate]);

  // 2. Stats Calculation (Based on Date Filtered Payments)
  const stats = useMemo(() => {
    const total = paymentsByDate.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const profit = total * 0.03;
    const toUSDT = total - profit;

    const perAgent = paymentsByDate.reduce((acc, curr) => {
      if (!acc[curr.agent]) {
        acc[curr.agent] = { total: 0, count: 0, refs: [] };
      }
      acc[curr.agent].total += Number(curr.amount);
      acc[curr.agent].count += 1;
      acc[curr.agent].refs.push(curr.reference);
      return acc;
    }, {});

    return { total, profit, toUSDT, perAgent };
  }, [paymentsByDate]);

  // 3. History View Filter
  const historyFilteredList = useMemo(() => {
    const lowerSearch = historySearch.toLowerCase();
    return paymentsByDate.filter(p =>
      p.agent.toLowerCase().includes(lowerSearch) ||
      p.reference.includes(lowerSearch) ||
      p.amount.toString().includes(lowerSearch)
    );
  }, [paymentsByDate, historySearch]);

  // 4. Summary View Filter
  const summaryFilteredList = useMemo(() => {
    const lowerSearch = summarySearch.toLowerCase();
    return paymentsByDate.filter(p =>
      p.agent.toLowerCase().includes(lowerSearch) ||
      p.reference.includes(lowerSearch)
    );
  }, [paymentsByDate, summarySearch]);

  // 5. Stats View - Date Range Filter
  const statsPayments = useMemo(() => {
    return payments.filter(p => {
      const pDate = getVenezuelaDateISO(p.timestamp);
      return pDate >= statsStartDate && pDate <= statsEndDate;
    });
  }, [payments, statsStartDate, statsEndDate]);

  const statsData = useMemo(() => {
    const total = statsPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const profit = total * 0.03;
    const toUSDT = total - profit;

    const perAgent = statsPayments.reduce((acc, curr) => {
      if (!acc[curr.agent]) {
        acc[curr.agent] = 0;
      }
      acc[curr.agent] += Number(curr.amount);
      return acc;
    }, {});

    return { total, profit, toUSDT, perAgent };
  }, [statsPayments]);

  // Chart Data
  const barChartData = {
    labels: ['Total Recaudado', 'Honorarios (3%)', 'A Pasar (USDT)'],
    datasets: [{
      label: 'Bolivares (Bs)',
      data: [statsData.total, statsData.profit, statsData.toUSDT],
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(59, 130, 246, 0.8)'
      ],
      borderColor: [
        'rgb(16, 185, 129)',
        'rgb(245, 158, 11)',
        'rgb(59, 130, 246)'
      ],
      borderWidth: 2
    }]
  };

  const pieChartData = {
    labels: Object.keys(statsData.perAgent),
    datasets: [{
      label: 'Recaudado (Bs)',
      data: Object.values(statsData.perAgent),
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(132, 204, 22, 0.8)',
        'rgba(14, 165, 233, 0.8)'
      ],
      borderWidth: 2
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgb(226, 232, 240)'
        }
      }
    },
    scales: {
      y: {
        ticks: { color: 'rgb(148, 163, 184)' },
        grid: { color: 'rgba(148, 163, 184, 0.1)' }
      },
      x: {
        ticks: { color: 'rgb(148, 163, 184)' },
        grid: { display: false }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: 'rgb(226, 232, 240)',
          padding: 10,
          font: { size: 11 }
        }
      }
    }
  };


  // Duplicate Checker
  const checkDuplicate = (ref) => {
    return payments.find(p => p.reference === ref && p.id !== editingId);
  };

  const startEdit = (payment) => {
    setForm({
      agent: payment.agent,
      amount: payment.amount.toString(),
      reference: payment.reference,
      date: getVenezuelaDateISO(payment.timestamp)
    });
    setEditingId(payment.id);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setError('');
    setSuccessMsg('✏️ Editando registro...');
  };

  const cancelEdit = () => {
    setForm({ agent: '', amount: '', reference: '', date: getVenezuelaDateISO() });
    setEditingId(null);
    setSuccessMsg('');
    setError('');
  };

  const handeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!form.agent || !form.amount || !form.reference) {
      setError('Todos los campos son obligatorios');
      return;
    }

    if (form.reference.length < 4) {
      setError('La referencia debe tener al menos 4 dígitos');
      return;
    }

    const duplicate = checkDuplicate(form.reference);
    if (duplicate) {
      const dateStr = formatVenezuelaDate(duplicate.timestamp);
      setError(`⚠️ DUPLICADA. Registrada el ${dateStr} por ${duplicate.agent}`);
      return;
    }

    try {
      if (editingId) {
        // UPDATE Existing Payment
        await updateDoc(doc(db, 'payments', editingId), {
          agent: form.agent,
          amount: parseFloat(form.amount),
          reference: form.reference,
          timestamp: new Date(`${form.date}T${new Date().toISOString().split('T')[1]}`).toISOString()
        });
        setSuccessMsg(`Pago actualizado correctamente.`);
        setEditingId(null);
      } else {
        // CREATE New Payment
        // Combine selected date with current time to maintain chronological order
        const currentTime = new Date().toISOString().split('T')[1];
        const finalTimestamp = new Date(`${form.date}T${currentTime}`).toISOString();

        await addDoc(collection(db, 'payments'), {
          agent: form.agent,
          amount: parseFloat(form.amount),
          reference: form.reference,
          timestamp: finalTimestamp
        });

        if (!agents.includes(form.agent)) {
          await addDoc(collection(db, 'agents'), { name: form.agent });
        }
        setSuccessMsg(`Pago de ${form.agent} registrado.`);
      }

      setForm({ agent: '', amount: '', reference: '', date: getVenezuelaDateISO() });

    } catch (err) {
      console.error(err);
      setError('Error al guardar. Verifica tu conexión.');
    }
  };

  const deletePayment = async (id) => {
    if (confirm('¿Eliminar registro de la NUBE?')) {
      try {
        await deleteDoc(doc(db, 'payments', id));
      } catch (err) {
        alert('Error al eliminar');
      }
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();

    // 1. Header
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('REPORTE DE CIERRE DIARIO', 105, 13, { align: 'center' });

    // 2. Summary Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Fecha: ${globalFilterDate}`, 14, 30);

    // Totals Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, 35, 180, 25, 3, 3, 'FD');

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text('Total Recaudado:', 20, 45);
    doc.text('Honorarios (3%):', 80, 45);
    doc.text('A Pasar (USDT):', 140, 45);

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(stats.total), 20, 53);
    doc.setTextColor(16, 185, 129);
    doc.text(formatMoney(stats.profit), 80, 53);
    doc.setTextColor(59, 130, 246);
    doc.text(formatMoney(stats.toUSDT), 140, 53);

    // 3. Table
    const tableRows = summaryFilteredList.map(p => [
      p.agent,
      p.reference,
      formatVenezuelaTime(p.timestamp),
      formatMoney(p.amount)
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['Agente', 'Referencia', 'Hora', 'Monto']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10 },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Save
    doc.save(`Reporte_Pagos_${globalFilterDate}.pdf`);
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text p-4 pb-48 font-sans max-w-md mx-auto">

      {/* Header & Date Filter */}
      <header className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <img src="logo-tc.jpg" alt="Logo" className="w-12 h-12 rounded-full shadow-lg border border-emerald-500/30" />
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent flex items-center gap-2">
                Control Pagos
                {isOnline ? <Cloud size={16} className="text-emerald-500" /> : <CloudOff size={16} className="text-red-500" />}
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowHistory(false); setShowStats(false); }}
              className={`p-2 rounded-full transition ${!showHistory && !showStats ? 'bg-emerald-500 text-white' : 'bg-app-card text-app-muted'}`}
              title="Registro"
            >
              <PlusCircle size={20} />
            </button>
            <button
              onClick={() => { setShowHistory(true); setShowStats(false); }}
              className={`p-2 rounded-full transition ${showHistory && !showStats ? 'bg-emerald-500 text-white' : 'bg-app-card text-app-muted'}`}
              title="Historial"
            >
              <History size={20} />
            </button>
            <button
              onClick={() => { setShowHistory(false); setShowStats(true); }}
              className={`p-2 rounded-full transition ${showStats ? 'bg-emerald-500 text-white' : 'bg-app-card text-app-muted'}`}
              title="Estadísticas"
            >
              <BarChart3 size={20} />
            </button>
          </div>
        </div>

        {/* Exchange Rates Row */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">BCV</span>
            <span className="text-sm font-mono font-bold text-emerald-400">
              {exchangeRates.loading ? '...' : exchangeRates.bcv.toFixed(2)}
            </span>
          </div>
          <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Parallel</span>
            <span className="text-sm font-mono font-bold text-amber-400">
              {exchangeRates.loading ? '...' : exchangeRates.paralelo.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Global Date Filter */}
        <div className="bg-app-card p-2 rounded-xl border border-slate-700 flex items-center gap-3 shadow-sm">
          <Calendar size={18} className="text-emerald-500 ml-2" />
          <div className="flex-1">
            <label className="text-[10px] text-app-muted font-bold tracking-wider uppercase block">Filtrar Fecha</label>
            <input
              type="date"
              value={globalFilterDate}
              onChange={(e) => setGlobalFilterDate(e.target.value)}
              className="bg-transparent text-white text-sm font-bold w-full outline-none"
            />
          </div>
          {globalFilterDate !== getVenezuelaDateISO() && (
            <button
              onClick={() => setGlobalFilterDate(getVenezuelaDateISO())}
              className="text-xs text-emerald-400 font-medium px-3 py-1 bg-emerald-500/10 rounded-lg"
            >
              Hoy
            </button>
          )}
        </div>
      </header>

      {/* Main Stats Cards */}
      {!showHistory && !showStats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-app-card p-3 rounded-2xl border border-slate-700 col-span-2 flex justify-between items-center bg-gradient-to-br from-slate-800 to-slate-900">
            <div>
              <span className="text-xs font-medium text-app-muted uppercase tracking-wider block mb-1">Total Recaudado</span>
              <span className="text-3xl font-bold text-white tracking-tight">{formatMoney(stats.total)}</span>
            </div>
            <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
              <Wallet size={20} />
            </div>
          </div>

          <div className="bg-app-card p-3 rounded-2xl border border-slate-700">
            <span className="text-[10px] font-medium text-app-muted uppercase tracking-wider block mb-1">Honorarios (3%)</span>
            <span className="text-lg font-bold text-emerald-400">{formatMoney(stats.profit)}</span>
          </div>

          <div className="bg-app-card p-3 rounded-2xl border border-slate-700 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5"></div>
            <span className="text-[10px] font-medium text-blue-300 uppercase tracking-wider block mb-1 relative z-10">Pasar a USDT</span>
            <span className="text-lg font-bold text-blue-400 relative z-10">{formatMoney(stats.toUSDT)}</span>
          </div>
        </div>
      )}

      {/* VIEW 1: FORM & SUMMARY */}
      {!showHistory && !showStats ? (
        <>
          {/* Entry Form */}
          <div className={`bg-app-card rounded-2xl p-4 shadow-xl border ${editingId ? 'border-amber-500/50' : 'border-slate-700'} mb-8 relative overflow-hidden transition-colors`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full pointer-events-none"></div>

            <h2 className={`text-sm font-bold ${editingId ? 'text-amber-400' : 'text-white'} mb-4 flex items-center gap-2`}>
              <div className={`w-1 h-4 ${editingId ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full`}></div>
              {editingId ? 'EDITAR PAGO' : 'REGISTRAR PAGO'}
            </h2>

            <form onSubmit={handeSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
                  />
                  <div className="absolute top-[-8px] left-3 bg-app-card px-1 text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Fecha Pago</div>
                </div>
                <div className="relative">
                  <input
                    list="agents-list"
                    value={form.agent}
                    onChange={e => setForm({ ...form, agent: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm placeholder:text-slate-500"
                    placeholder="Agente..."
                  />
                  <datalist id="agents-list">
                    {agents.map(a => <option key={a} value={a} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number" step="0.01" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm placeholder:text-slate-500"
                  placeholder="Monto (Bs)"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  name="reference"
                  autoComplete="off"
                  value={form.reference}
                  onChange={e => {
                    setForm({ ...form, reference: e.target.value });
                    if (checkDuplicate(e.target.value) && e.target.value.length >= 4) setError(`⚠️ Existe: ${e.target.value}`);
                    else if (error.includes('Existe')) setError('');
                  }}
                  className={`bg-slate-900 border ${error.includes('Existe') ? 'border-red-500' : 'border-slate-700'} rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm placeholder:text-slate-500`}
                  style={{ backgroundColor: '#0f172a', color: 'white' }}
                  placeholder="Ref (4 dig)"
                />
              </div>

              {error && <div className="text-xs text-red-300 bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</div>}
              {successMsg && <div className={`text-xs ${editingId ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'} p-2 rounded-lg border`}>{successMsg}</div>}

              <div className="flex gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="w-1/3 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={!isOnline} className={`flex-1 ${editingId ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-all`}>
                  {isOnline ? (editingId ? 'Actualizar Pago' : 'Guardar') : 'Sin Conexión'}
                </button>
              </div>
            </form>
          </div>

          {/* Summary Section */}
          <div className="mt-6">
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-sm font-bold text-app-muted uppercase tracking-wider flex items-center gap-2">
                <Users size={14} /> Resumen ({summaryFilteredList.length})
              </h3>
              <div className="relative w-1/2">
                <input
                  className="w-full bg-slate-800 border-none rounded-lg py-1 px-8 text-xs text-white outline-none"
                  placeholder="Buscar en resumen..."
                  value={summarySearch}
                  onChange={e => setSummarySearch(e.target.value)}
                />
                <Filter size={10} className="absolute left-2.5 top-2 text-slate-500" />
              </div>
            </div>

            <div className="space-y-2">
              {summaryFilteredList.map((p) => (
                <div key={p.id} className="group relative overflow-hidden bg-app-card border border-slate-800 p-3 rounded-xl hover:border-slate-600 transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-white truncate pr-2">{p.agent}</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{formatMoney(p.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-yellow-400 font-bold text-sm">Ref: {p.reference}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-white font-bold text-sm">{formatVenezuelaTime(p.timestamp)}</span>
                    </div>
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => startEdit(p)}
                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition"
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => deletePayment(p.id)}
                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {summaryFilteredList.length === 0 && <div className="text-center text-xs text-slate-500 py-4">No hay datos que coincidan</div>}
            </div>
          </div>
        </>
      ) : showHistory ? (
        /* VIEW 2: DETAILED HISTORY */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 flex-1 flex flex-col">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Historial Detallado</h2>
            <div className="relative">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar referencia, monto, agente..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none shadow-inner"
              />
              <div className="absolute left-3 top-3.5 text-slate-400">
                <Filter size={16} />
              </div>
            </div>
          </div>

          <div className="bg-app-card rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
            <div className="grid grid-cols-12 gap-1 p-3 bg-slate-900 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700">
              <div className="col-span-4 pl-1">Agente / Hora</div>
              <div className="col-span-3 text-right">Monto</div>
              <div className="col-span-3 text-center">Ref</div>
              <div className="col-span-2 text-right">Acción</div>
            </div>

            <div className="overflow-y-auto flex-1 p-1">
              {historyFilteredList.length === 0 ? (
                <div className="p-10 text-center text-slate-600 text-sm">
                  {loading ? 'Cargando datos...' : 'Sin resultados'}
                </div>
              ) : historyFilteredList.map(p => (
                <div key={p.id} className="grid grid-cols-12 gap-1 p-2 mb-1 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800/50 transition-all items-center text-xs group">
                  <div className="col-span-4 truncate">
                    <div className="font-medium text-slate-200 truncate">{p.agent}</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {p.timestamp.startsWith(new Date().toISOString().split('T')[0])
                        ? formatVenezuelaTime(p.timestamp)
                        : formatVenezuelaDate(p.timestamp)
                      }
                    </div>
                  </div>
                  <div className="col-span-3 text-right font-mono font-medium text-emerald-400 truncate">
                    {formatMoney(p.amount).replace('Bs.', '')}
                  </div>
                  <div className="col-span-3 text-center font-mono text-slate-400 bg-slate-900/50 rounded py-0.5 border border-slate-800">
                    {p.reference}
                  </div>
                  <div className="col-span-2 text-right flex justify-end gap-1">
                    <button
                      onClick={() => startEdit(p)}
                      className="p-1.5 text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deletePayment(p.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                      title="Eliminar de Nube"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : showStats ? (
        /* VIEW 3: STATISTICS */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BarChart3 size={20} className="text-emerald-500" />
              Estadísticas y Análisis
            </h2>

            {/* Date Range Filter */}
            <div className="bg-app-card p-3 rounded-xl border border-slate-700 mb-4">
              <label className="text-xs font-bold text-app-muted uppercase tracking-wider block mb-2">Rango de Fechas</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Desde</label>
                  <input
                    type="date"
                    value={statsStartDate}
                    onChange={(e) => setStatsStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Hasta</label>
                  <input
                    type="date"
                    value={statsEndDate}
                    onChange={(e) => setStatsEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="col-span-2 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4 rounded-xl flex justify-between items-center">
                <div className="text-xs text-emerald-400 font-bold uppercase">Total</div>
                <div className="text-2xl font-bold text-white">{formatMoney(statsData.total)}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-3 rounded-xl">
                <div className="text-[10px] text-amber-400 font-bold uppercase mb-1">Honorarios</div>
                <div className="text-lg font-bold text-white">{formatMoney(statsData.profit)}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-3 rounded-xl">
                <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">USDT</div>
                <div className="text-lg font-bold text-white">{formatMoney(statsData.toUSDT)}</div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-app-card p-4 rounded-xl border border-slate-700 mb-4">
              <h3 className="text-sm font-bold text-white mb-3">Desglose de Ingresos</h3>
              <div style={{ height: '250px' }}>
                <Bar data={barChartData} options={chartOptions} />
              </div>
            </div>

            {/* Pie Chart */}
            {Object.keys(statsData.perAgent).length > 0 && (
              <div className="bg-app-card p-4 rounded-xl border border-slate-700">
                <h3 className="text-sm font-bold text-white mb-3">Distribución por Agente</h3>
                <div style={{ height: '300px' }}>
                  <Pie data={pieChartData} options={pieOptions} />
                </div>
              </div>
            )}

            {/* Stats Summary Table */}
            <div className="mt-4 bg-app-card rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-3 bg-slate-900 border-b border-slate-700">
                <h3 className="text-sm font-bold text-white">Resumen por Agente</h3>
              </div>
              <div className="p-3">
                {Object.entries(statsData.perAgent).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(statsData.perAgent)
                      .sort((a, b) => b[1] - a[1])
                      .map(([agent, total]) => (
                        <div key={agent} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                          <span className="text-sm text-slate-300">{agent}</span>
                          <span className="text-sm font-bold text-emerald-400">{formatMoney(total)}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    No hay datos en el rango seleccionado
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null
      }

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-app-bg/95 backdrop-blur-sm border-t border-slate-800 z-50 flex justify-center">
        <div className="w-full max-w-md">
          <button
            onClick={generatePDF}
            className="w-full py-3 bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-xl transition text-sm font-bold flex justify-center items-center gap-2 shadow-lg"
          >
            <FileText size={18} /> DESCARGAR REPORTE PDF
          </button>

          {/* Branding */}
          <div className="mt-3 text-center">
            <p className="text-xs text-slate-500">
              Diseñado con <span className="text-red-400">♥</span> por{' '}
              <span className="font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                TechCodek
              </span>
            </p>
          </div>
        </div>
      </div>

    </div >
  );
}

export default App;
