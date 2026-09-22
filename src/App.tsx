import React, { useState, useEffect, useMemo } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { POCFilingView } from './components/POCFilingView';
import { DashboardOverview } from './components/DashboardOverview';
import { DailySiteActivityForm } from './components/DailySiteActivityForm';
import { HousekeepingForm } from './components/forms/HousekeepingForm';
import { EbDgDailyEntryForm } from './components/forms/EbDgDailyEntryForm';
import { WashingAdhocForm } from './components/forms/WashingAdhocForm';
import { OperationalSheetsHub } from './components/OperationalSheetsHub';
import { SheetDataExplorer } from './components/SheetDataExplorer';
import { FormBuilder } from './components/forms/FormBuilder';
import { TaskChecklists } from './components/TaskChecklists';
import { Noticeboard } from './components/Noticeboard';
import { DieselTracker } from './components/DieselTracker';
import { AdminDashboard } from './components/AdminDashboard';
import { GoogleSheetsMasterConnector } from './components/GoogleSheetsMasterConnector';
import { ToastNotification } from './components/ToastNotification';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AccessDenied } from './components/common/AccessDenied';
import { DemoModeBanner, StartupScreen } from './components/common/StartupScreen';
import { capabilitiesFor } from './lib/permissions';
import { usePendingWork } from './components/common/usePendingWork';

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

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);

  // Role-based initial view: Super Admin lands on Control Room (dashboard), POC lands on Site Filing Desk (pocFiling)
  const [currentView, setCurrentView] = useState<string>(() => {
    return currentUser.role === 'SUPER_ADMIN' ? 'dashboard' : 'pocFiling';
  });

  const [viewHistory, setViewHistory] = useState<string[]>([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  // The form the builder is editing; unset means a new form.
  const [editFormId, setEditFormId] = useState<string | undefined>();

  useEffect(() => {
    if (currentView !== 'createForm') setEditFormId(undefined);
  }, [currentView]);

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
    } else if (sheetId === 'SHEET_DG_POWER_WATER' || sheetId === 'SHEET_EB_DG') {
      // Both power/water cards open the EB-DG form. The legacy DG/EB/Water
      // form asked the POC to type HSD *Consumption* and showed HSD *Closing*
      // as a derived tile — the inverse of the sheet contract, where Closing
      // is the dip reading the POC takes and Consumption is derived from it.
      // Filing through it produced wrong consumption and broke the next day's
      // opening, so no route reaches it any more.
      navigateTo('ebDg');
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
    // Back to the catalog, replacing the builder in history rather than
    // stacking on it, so Back does not reopen a form that is already saved.
    setViewHistory(h => (h[h.length - 1] === 'sheets' ? h.slice(0, -1) : h));
    setCurrentView('sheets');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // One calculation, shared with the top bar's bell and the alert list.
  const pendingAlertCount = usePendingWork().total;

  const isHomeView =
    (currentUser.role === 'SUPER_ADMIN' && currentView === 'dashboard') ||
    (currentUser.role === 'SITE_POC' && currentView === 'pocFiling');

  return (
    // 100dvh, not 100vh: on iOS Safari 100vh counts the address bar that is
    // not actually there, so the page was always a little taller than the
    // screen and jumped as the bar hid on scroll.
    <div className="min-h-[100dvh] bg-[var(--color-floor)] text-[var(--color-ink)] flex font-sans selection:bg-[var(--color-ink)] selection:text-white antialiased">
      {/* Modern Clean Auto-Hiding / Hover-Expandable Side Panel */}
      <Sidebar
        currentView={currentView}
        onSelectView={navigateTo}
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
        {/* pb-20 clears the mobile bottom bar; mb-safe clears the home
            indicator underneath it, and is 0 everywhere else. */}
        <main className="flex-1 p-3 sm:p-5 lg:p-7 max-w-7xl w-full mx-auto pb-20 md:pb-8 mb-safe">
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

            {/* Gated at the route, not just hidden from the menus: this
                console shapes the forms every site files, and view state
                survives a persona switch and back-history. */}
            {currentView === 'sheets' && (
              !caps.canEditSchema ? (
                <AccessDenied what="the operational sheets console" onBack={handleGoBack} />
              ) : (
              <OperationalSheetsHub
                onSelectSheet={handleSelectSheetFromHub}
                onOpenCreateForm={() => navigateTo('createForm')}
                onEditForm={(sheetId) => {
                  setEditFormId(sheetId);
                  navigateTo('createForm');
                }}
                onOpenDatabase={handleOpenDatabaseForSheet}
                onBack={handleGoBack}
              />
              )
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

            {/* 'dgPower' is kept as an alias so existing links/back-history still
                resolve, but it renders the EB-DG form — see the note in
                handleSelectSheetFromHub. The admin dashboards still read the
                historical dgPowerLogs from the old DG form. */}
            {(currentView === 'dgPower' || currentView === 'ebDg') && (
              <EbDgDailyEntryForm
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
                onNavigateTab={navigateTo}
                onEditForm={(sheetId) => {
                  setEditFormId(sheetId);
                  navigateTo('createForm');
                }}
              />
            )}

            {currentView === 'createForm' && (
              caps.canEditSchema
                ? <FormBuilder key={editFormId ?? 'new'} editSheetId={editFormId} onClose={handleGoBack} onSaved={handleFormCreated} />
                : <AccessDenied what="the form builder" onBack={handleGoBack} />
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

            {/* Master data and schema editing are gated at the ROUTE, not just
                hidden from the sidebar. Navigation state survives a persona
                switch and back-history, so a POC could otherwise land on the
                spreadsheet/Apps-Script wiring without ever seeing a link to it. */}
            {currentView === 'masterData' && (
              caps.canManageMasterData
                ? <GoogleSheetsMasterConnector onBack={handleGoBack} />
                : <AccessDenied what="master data and sheet connections" onBack={handleGoBack} />
            )}

            {/* Ungated: everyone reads the noticeboard. Posting is the one
                Super Admin act, and the screen checks that itself. */}
            {currentView === 'noticeboard' && <Noticeboard onBack={handleGoBack} />}

            {currentView === 'adminDashboard' && (
              <AdminDashboard
                onNavigateTab={navigateTo}
                onBack={handleGoBack}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Minimal Footer */}
        <footer className="py-4 px-6 text-xs text-[var(--text-muted)] flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto mb-14 md:mb-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--text-secondary)]">WarehouseOS</span>
          </div>
        </footer>
      </div>

      {/* Mobile-Optimized Bottom Floating Quick Navigation Bar (Visible only on phone/small screens) */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
        pendingAlertCount={pendingAlertCount}
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

/**
 * Nothing renders until we know who this is. MainContent picks its landing
 * view from the user's role on mount, so mounting it before /api/me answers
 * would land a Super Admin on a POC screen.
 */
const Gate: React.FC = () => {
  const { dataMode, accessProblem } = useApp();
  if (dataMode === 'loading') return <StartupScreen />;
  if (accessProblem) return <StartupScreen problem={accessProblem} />;
  return (
    <>
      <MainContent />
      {dataMode === 'demo' && <DemoModeBanner />}
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
