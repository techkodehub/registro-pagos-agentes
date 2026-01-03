import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Trash2, Wallet, Users, AlertCircle, CheckCircle2, History, X, Calendar, Filter } from 'lucide-react';

// Utility to format currency
const formatMoney = (amount) => {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(amount);
};

// Main Component
function App() {
  const [payments, setPayments] = useState(() => {
    const saved = localStorage.getItem('dailyPayments');
    return saved ? JSON.parse(saved) : [];
  });

  const [agents, setAgents] = useState(() => {
    const savedAgents = localStorage.getItem('agentsList_v2');
    return savedAgents ? JSON.parse(savedAgents) : [
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
    ];
  });

  const [form, setForm] = useState({ agent: '', amount: '', reference: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // New States for Filtering
  const [globalFilterDate, setGlobalFilterDate] = useState(() => {
    // Default to Today in YYYY-MM-DD format
    return new Date().toISOString().split('T')[0];
  });
  const [historySearch, setHistorySearch] = useState('');
  const [summarySearch, setSummarySearch] = useState('');

  // 1. First Layer: Filter ALL payments by DATE
  const paymentsByDate = useMemo(() => {
    if (!globalFilterDate) return payments;
    return payments.filter(p => p.timestamp.startsWith(globalFilterDate));
  }, [payments, globalFilterDate]);

  // 2. Stats Calculation (Based on Date Filtered Payments)
  const stats = useMemo(() => {
    const total = paymentsByDate.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const profit = total * 0.03;
    const toUSDT = total - profit; // Remaining amount to convert

    // Group by Agent (for Summary) using the date-filtered list
    const perAgent = paymentsByDate.reduce((acc, curr) => {
      // Store object {amount, count, references} to be more detailed if needed
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

  // 3. History View Filter (Search bar inside history)
  const historyFilteredList = useMemo(() => {
    const lowerSearch = historySearch.toLowerCase();
    return paymentsByDate.filter(p =>
      p.agent.toLowerCase().includes(lowerSearch) ||
      p.reference.includes(lowerSearch) ||
      p.amount.toString().includes(lowerSearch)
    );
  }, [paymentsByDate, historySearch]);

  // 4. Summary View Filter (Search bar for agents summary)
  const summaryFilteredList = useMemo(() => {
    const lowerSearch = summarySearch.toLowerCase();
    // Convert stats.perAgent object to array for easier filtering/mapping
    return Object.entries(stats.perAgent)
      .filter(([agent, data]) =>
        agent.toLowerCase().includes(lowerSearch) ||
        data.refs.some(r => r.includes(lowerSearch))
      )
      .sort((a, b) => b[1].total - a[1].total); // Sort by highest amount
  }, [stats.perAgent, summarySearch]);


  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('dailyPayments', JSON.stringify(payments));
  }, [payments]);

  useEffect(() => {
    localStorage.setItem('agentsList_v2', JSON.stringify(agents));
  }, [agents]);

  // Duplicate Checker (Checks against ALL payments, not just today's, to be safe?)
  // Usually unique reference is global or daily. Assuming global check for safety.
  const checkDuplicate = (ref) => {
    // Check in the entire payments history to avoid any duplicate ever? 
    // Or just today? Let's check in 'payments' (all time) for safety.
    return payments.find(p => p.reference === ref);
  };

  const handeSubmit = (e) => {
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
      // Show date of duplicate if it's old
      const dateStr = new Date(duplicate.timestamp).toLocaleDateString();
      setError(`⚠️ DUPLICADA. Registrada el ${dateStr} por ${duplicate.agent}`);
      return;
    }

    const newPayment = {
      id: Date.now(),
      agent: form.agent,
      amount: parseFloat(form.amount),
      reference: form.reference,
      timestamp: new Date().toISOString()
    };

    setPayments([newPayment, ...payments]);

    if (!agents.includes(form.agent)) {
      setAgents(prev => [...prev, form.agent]);
    }

    setSuccessMsg(`Pago de ${form.agent} registrado.`);
    setForm({ agent: '', amount: '', reference: '' });
  };

  const deletePayment = (id) => {
    if (confirm('¿Eliminar registro?')) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  const closeDay = () => {
    if (confirm('¿CERRAR EL DÍA? Borrará la base de datos local.')) {
      const report = `REPORTE ${globalFilterDate}\n\nTotal: ${formatMoney(stats.total)}\nHonorarios (3%): ${formatMoney(stats.profit)}\nA Pasar (USDT): ${formatMoney(stats.toUSDT)}\n\nDetalle:\n${summaryFilteredList.map(([name, d]) => `- ${name}: ${formatMoney(d.total)} (${d.count} pagos)`).join('\n')}`;
      navigator.clipboard.writeText(report);
      alert('Reporte copiado. Base de datos reiniciada.');
      setPayments([]);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text p-4 pb-20 font-sans max-w-md mx-auto">

      {/* Header & Date Filter */}
      <header className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
              Control Pagos
            </h1>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-full transition ${showHistory ? 'bg-emerald-500 text-white' : 'bg-app-card text-app-muted'}`}
          >
            {showHistory ? <PlusCircle size={24} /> : <History size={24} />}
          </button>
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
          {globalFilterDate !== new Date().toISOString().split('T')[0] && (
            <button
              onClick={() => setGlobalFilterDate(new Date().toISOString().split('T')[0])}
              className="text-xs text-emerald-400 font-medium px-3 py-1 bg-emerald-500/10 rounded-lg"
            >
              Hoy
            </button>
          )}
        </div>
      </header>

      {/* Main Stats Cards (Affected by Date Filter) */}
      {!showHistory && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Total */}
          <div className="bg-app-card p-3 rounded-2xl border border-slate-700 col-span-2 flex justify-between items-center bg-gradient-to-br from-slate-800 to-slate-900">
            <div>
              <span className="text-xs font-medium text-app-muted uppercase tracking-wider block mb-1">Total Recaudado</span>
              <span className="text-3xl font-bold text-white tracking-tight">{formatMoney(stats.total)}</span>
            </div>
            <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
              <Wallet size={20} />
            </div>
          </div>

          {/* Profit 3% */}
          <div className="bg-app-card p-3 rounded-2xl border border-slate-700">
            <span className="text-[10px] font-medium text-app-muted uppercase tracking-wider block mb-1">Honorarios (3%)</span>
            <span className="text-lg font-bold text-emerald-400">{formatMoney(stats.profit)}</span>
          </div>

          {/* Remainder (USDT) */}
          <div className="bg-app-card p-3 rounded-2xl border border-slate-700 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5"></div>
            <span className="text-[10px] font-medium text-blue-300 uppercase tracking-wider block mb-1 relative z-10">Pasar a USDT</span>
            <span className="text-lg font-bold text-blue-400 relative z-10">{formatMoney(stats.toUSDT)}</span>
          </div>
        </div>
      )}

      {/* VIEW 1: FORM & SUMMARY */}
      {!showHistory ? (
        <>
          {/* Entry Form */}
          <div className="bg-app-card rounded-2xl p-4 shadow-xl border border-slate-700 mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full pointer-events-none"></div>

            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
              REGISTRAR PAGO
            </h2>

            <form onSubmit={handeSubmit} className="space-y-3">
              <div>
                <input
                  list="agents-list"
                  value={form.agent}
                  onChange={e => setForm({ ...form, agent: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm placeholder:text-slate-500"
                  placeholder="Seleccionar Agente..."
                />
                <datalist id="agents-list">
                  {agents.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number" step="0.01" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm placeholder:text-slate-500"
                  placeholder="Monto (Bs)"
                />
                <input
                  type="text" inputMode="numeric" value={form.reference}
                  onChange={e => {
                    setForm({ ...form, reference: e.target.value });
                    if (checkDuplicate(e.target.value) && e.target.value.length >= 4) setError(`⚠️ Existe: ${e.target.value}`);
                    else if (error.includes('Existe')) setError('');
                  }}
                  className={`bg-slate-900 border ${error.includes('Existe') ? 'border-red-500' : 'border-slate-700'} rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm placeholder:text-slate-500`}
                  placeholder="Ref (4 dig)"
                />
              </div>

              {error && <div className="text-xs text-red-300 bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</div>}
              {successMsg && <div className="text-xs text-emerald-300 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">{successMsg}</div>}

              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all">
                Guardar
              </button>
            </form>
          </div>

          {/* Agents Summary Section */}
          <div className="mt-6">
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-sm font-bold text-app-muted uppercase tracking-wider flex items-center gap-2">
                <Users size={14} /> Resumen ({summaryFilteredList.length})
              </h3>
              {/* Search for Summary */}
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
              {summaryFilteredList.map(([agent, data]) => (
                <div key={agent} className="group relative overflow-hidden bg-app-card border border-slate-800 p-3 rounded-xl hover:border-slate-600 transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-white truncate pr-2">{agent}</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{formatMoney(data.total)}</span>
                  </div>
                  {/* Detailed Sub-info for agent */}
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>{data.count} pagos</span>
                    <span className="truncate max-w-[120px] ml-auto font-mono opacity-50">
                      Ult. Ref: {data.refs[data.refs.length - 1]}
                    </span>
                  </div>
                </div>
              ))}
              {summaryFilteredList.length === 0 && <div className="text-center text-xs text-slate-500 py-4">No hay datos que coincidan</div>}
            </div>
          </div>
        </>
      ) : (
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
            {/* Sticky Header */}
            <div className="grid grid-cols-12 gap-1 p-3 bg-slate-900 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700">
              <div className="col-span-4 pl-1">Agente / Hora</div>
              <div className="col-span-3 text-right">Monto</div>
              <div className="col-span-3 text-center">Ref</div>
              <div className="col-span-2 text-right">Acción</div>
            </div>

            <div className="overflow-y-auto flex-1 p-1">
              {historyFilteredList.length === 0 ? (
                <div className="p-10 text-center text-slate-600 text-sm">
                  Sin resultados
                </div>
              ) : historyFilteredList.map(p => (
                <div key={p.id} className="grid grid-cols-12 gap-1 p-2 mb-1 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800/50 transition-all items-center text-xs group">
                  <div className="col-span-4 truncate">
                    <div className="font-medium text-slate-200 truncate">{p.agent}</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {/* If date is today, show only time, else show date */}
                      {p.timestamp.startsWith(new Date().toISOString().split('T')[0])
                        ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date(p.timestamp).toLocaleDateString()
                      }
                    </div>
                  </div>
                  <div className="col-span-3 text-right font-mono font-medium text-emerald-400 truncate">
                    {formatMoney(p.amount).replace('Bs.', '')}
                  </div>
                  <div className="col-span-3 text-center font-mono text-slate-400 bg-slate-900/50 rounded py-0.5 border border-slate-800">
                    {p.reference}
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      onClick={() => deletePayment(p.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions (Always visible at bottom safe area) */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-app-bg/95 backdrop-blur-sm border-t border-slate-800 z-50 flex justify-center">
        <div className="w-full max-w-md">
          <button
            onClick={closeDay}
            className="w-full py-2.5 border border-slate-700/50 text-slate-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 rounded-lg transition text-xs font-medium flex justify-center items-center gap-2"
          >
            <Trash2 size={14} /> COPIAR CIERRE Y REINICIAR
          </button>
        </div>
      </div>

    </div>
  );
}

export default App;
