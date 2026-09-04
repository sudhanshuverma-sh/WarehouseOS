import React, { useState, useEffect, useMemo } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { POCFilingView } from './components/POCFilingView';
import { DashboardOverview } from './components/DashboardOverview';
import { DailySiteActivityForm } from './components/DailySiteActivityForm';
import { HousekeepingForm } from './components/forms/HousekeepingForm';
import { DGPowerWaterForm } from './components/forms/DGPowerWaterForm';
import { WashingAdhocForm } from './components/forms/WashingAdhocForm';
import { OperationalSheetsHub } from './components/OperationalSheetsHub';
import { SheetDataExplorer } from './components/SheetDataExplorer';
import { CreateNewFormModal } from './components/CreateNewFormModal';
import { TaskChecklists } from './components/TaskChecklists';
import { DieselTracker } from './components/DieselTracker';
import { TemplateManager } from './components/TemplateManager';
import { ServiceAssignmentManager } from './components/ServiceAssignmentManager';
import { AdminDashboard } from './components/AdminDashboard';
import { GoogleSheetsMasterConnector } from './components/GoogleSheetsMasterConnector';
import { ArchitectureModal } from './components/ArchitectureModal';
import { ToastNotification } from './components/ToastNotification';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const MainContent: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    setSelectedWarehouseId,
    setActiveSheetId,
    warehouses,
    currentDate,
    dailySiteLogs,
    sheetRecords,
    dieselLogs
  } = useApp();

  // Role-based initial view: Super Admin lands on Control Room (dashboard), POC lands on Site Filing Desk (pocFiling)
  const [currentView, setCurrentView] = useState<string>(() => {
    return currentUser.role === 'SUPER_ADMIN' ? 'dashboard' : 'pocFiling';
  });

  const [viewHistory, setViewHistory] = useState<string[]>([]);
  const [isArchitectureModalOpen, setIsArchitectureModalOpen] = useState<boolean>(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);

  // Auto-adapt landing view when user switches role or persona
  useEffect(() => {
    if (currentUser.role === 'SUPER_ADMIN') {
      if (currentView === 'pocFiling') {
        setCurrentView('dashboard');
      }
    } else {
      if (currentView === 'dashboard') {
        setCurrentView('pocFiling');
      }
    }
  }, [currentUser.id, currentUser.role]);

  // Navigate with history tracking
  const navigateTo = (nextView: string) => {
    if (nextView === currentView) return;
    setViewHistory(prev => [...prev, currentView]);
    setCurrentView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Universal Back Handler
  const handleGoBack = () => {
    if (viewHistory.length > 0) {
      const prev = viewHistory[viewHistory.length - 1];
      setViewHistory(h => h.slice(0, -1));
      setCurrentView(prev);
    } else {
      const defaultHome = currentUser.role === 'SUPER_ADMIN' ? 'dashboard' : 'pocFiling';
      setCurrentView(defaultHome);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChecklistForWarehouse = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    navigateTo('checklists');
  };

  const handleSelectSheetFromHub = (sheetId: string) => {
    setActiveSheetId(sheetId);
    if (sheetId === 'SHEET_DAILY_SITE') {
      navigateTo('dailyForm');
    } else if (sheetId === 'SHEET_HOUSEKEEPING') {
      navigateTo('housekeeping');
    } else if (sheetId === 'SHEET_DG_POWER_WATER') {
      navigateTo('dgPower');
    } else if (sheetId === 'SHEET_WASHING' || sheetId === 'SHEET_ADHOC') {
      navigateTo('washing');
    } else if (sheetId === 'SHEET_DIESEL') {
      navigateTo('diesel');
    } else {
      navigateTo('database');
    }
  };

  const handleOpenDatabaseForSheet = (sheetId?: string) => {
    if (sheetId) {
      setActiveSheetId(sheetId);
    }
    navigateTo('database');
  };

  const handleFormCreated = (newSheetId: string) => {
    setActiveSheetId(newSheetId);
    navigateTo('database');
  };

  const pendingAlertCount = useMemo(() => {
    let count = 0;
    const userWhId = currentUser.warehouseId || 'WH_001';
    const wh = warehouses.find(w => w.id === userWhId) || warehouses[0];

    const filedDaily = dailySiteLogs.some(l => l.site === wh.id && l.date === currentDate);
    if (!filedDaily) count++;

    const hkFiled = (sheetRecords['SHEET_HOUSEKEEPING'] || []).some(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (!hkFiled) count++;

    const dgFiled = (sheetRecords['SHEET_DG_POWER_WATER'] || []).some(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (!dgFiled) count++;

    const pendingDiesel = dieselLogs.filter(d => d.warehouseId === wh.id && d.status === 'Approved').length;
    count += pendingDiesel;

    return count;
  }, [currentUser, warehouses, currentDate, dailySiteLogs, sheetRecords, dieselLogs]);

  const isHomeView =
    (currentUser.role === 'SUPER_ADMIN' && currentView === 'dashboard') ||
    (currentUser.role === 'SITE_POC' && currentView === 'pocFiling');

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans selection:bg-teal-600 selection:text-white antialiased">
      {/* Modern Clean Auto-Hiding / Hover-Expandable Side Panel */}
      <Sidebar
        currentView={currentView}
        onSelectView={navigateTo}
        onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
      />

      {/* Main App Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Clean Sticky Top Bar with Filters, Back Button & Fast Actions */}
        <TopBar
          currentView={currentView}
          onNavigate={navigateTo}
          onBack={handleGoBack}
          canGoBack={!isHomeView || viewHistory.length > 0}
        />

        {/* Dynamic Route Content */}
        <main className="flex-1 p-3 sm:p-5 lg:p-7 max-w-7xl w-full mx-auto pb-20 md:pb-8">
          <ErrorBoundary onReset={() => setCurrentView('dashboard')}>
            {currentView === 'pocFiling' && (
              <POCFilingView
                onNavigateToDatabase={(sheetId) => {
                  handleOpenDatabaseForSheet(sheetId);
                }}
                onNavigateToCreateForm={() => navigateTo('createForm')}
                onNavigateToForm={(viewName) => navigateTo(viewName)}
                onBack={handleGoBack}
              />
            )}

            {currentView === 'dashboard' && (
              <DashboardOverview
                onNavigateTab={navigateTo}
                onOpenChecklistForWarehouse={handleOpenChecklistForWarehouse}
                onBack={currentUser.role === 'SITE_POC' ? () => navigateTo('pocFiling') : undefined}
              />
            )}

            {currentView === 'sheets' && (
              <OperationalSheetsHub
                onSelectSheet={handleSelectSheetFromHub}
                onOpenCreateForm={() => navigateTo('createForm')}
                onOpenDatabase={handleOpenDatabaseForSheet}
                onBack={handleGoBack}
              />
            )}

            {currentView === 'dailyForm' && (
              <DailySiteActivityForm
                onNavigateToDashboard={() => navigateTo('dashboard')}
                onBack={handleGoBack}
              />
            )}

            {currentView === 'housekeeping' && (
              <HousekeepingForm
                onBack={handleGoBack}
                onSuccess={() => navigateTo('database')}
              />
            )}

            {currentView === 'dgPower' && (
              <DGPowerWaterForm
                onBack={handleGoBack}
                onSuccess={() => navigateTo('database')}
              />
            )}

            {currentView === 'washing' && (
              <WashingAdhocForm
                onBack={handleGoBack}
                onSuccess={() => navigateTo('database')}
              />
            )}

            {currentView === 'database' && (
              <SheetDataExplorer
                onBack={handleGoBack}
                onNavigateToCreateForm={() => navigateTo('createForm')}
              />
            )}

            {currentView === 'createForm' && (
              <CreateNewFormModal
                isOpen={true}
                onClose={handleGoBack}
                onFormCreated={handleFormCreated}
              />
            )}

            {currentView === 'diesel' && (
              <DieselTracker
                onBack={handleGoBack}
              />
            )}

            {currentView === 'checklists' && (
              <TaskChecklists
                onBack={handleGoBack}
              />
            )}

            {currentView === 'templates' && (
              <TemplateManager
                onBack={handleGoBack}
              />
            )}

            {currentView === 'serviceAssignments' && (
              <ServiceAssignmentManager
                onNavigateTab={navigateTo}
                onBack={handleGoBack}
              />
            )}

            {currentView === 'masterData' && (
              <GoogleSheetsMasterConnector
                onBack={handleGoBack}
              />
            )}

            {currentView === 'adminDashboard' && (
              <AdminDashboard
                onNavigateTab={navigateTo}
                onBack={handleGoBack}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Minimal Footer */}
        <footer className="bg-white border-t border-slate-200 py-3 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto mb-14 md:mb-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Warehouse Management Portal</span>
            <span>•</span>
            <span>AS_DailyLog + 15-Sheet Digital Operations Ecosystem</span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <button
              onClick={() => setIsArchitectureModalOpen(true)}
              className="text-teal-700 hover:text-teal-800 hover:underline font-semibold cursor-pointer"
            >
              Firestore Security Rules & Schema
            </button>
          </div>
        </footer>
      </div>

      {/* Mobile-Optimized Bottom Floating Quick Navigation Bar (Visible only on phone/small screens) */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
        onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
        pendingAlertCount={pendingAlertCount}
      />

      {/* Architecture & Security Rules Modal */}
      <ArchitectureModal
        isOpen={isArchitectureModalOpen}
        onClose={() => setIsArchitectureModalOpen(false)}
      />

      {/* Action Alerts & Filing Reminders Modal */}
      <NotificationCenterModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        onNavigateToForm={navigateTo}
      />

      {/* Global Toast Alerts */}
      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
