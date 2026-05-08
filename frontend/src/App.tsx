import { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { GetStartedPage } from './pages/GetStartedPage';
import { AgentsPage } from './pages/AgentsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { LogsPage } from './pages/LogsPage';
import { ArtifactsPage } from './pages/ArtifactsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { BackgroundTasksPage } from './pages/BackgroundTasksPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { DailyDigestPage } from './pages/DailyDigestPage';
import { SkillsWorkflowsPage } from './pages/SkillsWorkflowsPage';
import { CommandPalette } from './components/CommandPalette';
import { SetupScreen } from './components/SetupScreen';
import { Toaster } from './components/ui/sonner';
import { useAppStore } from './lib/store';
import { fetchModels, fetchServerInfo, fetchSavings, submitSavings, isTauri } from './lib/api';
import { OptInModal } from './components/OptInModal';

export default function App() {
  const [setupDone, setSetupDone] = useState(!isTauri());
  const handleSetupReady = useCallback(() => setSetupDone(true), []);
  const setModels = useAppStore((s) => s.setModels);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setServerInfo = useAppStore((s) => s.setServerInfo);
  const setSavings = useAppStore((s) => s.setSavings);
  const settings = useAppStore((s) => s.settings);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const optInDisplayName = useAppStore((s) => s.optInDisplayName);
  const optInEmail = useAppStore((s) => s.optInEmail);
  const optInAnonId = useAppStore((s) => s.optInAnonId);
  const optInModalSeen = useAppStore((s) => s.optInModalSeen);
  const optInModalOpen = useAppStore((s) => s.optInModalOpen);
  const setOptInModalOpen = useAppStore((s) => s.setOptInModalOpen);
  const markOptInModalSeen = useAppStore((s) => s.markOptInModalSeen);
  const savings = useAppStore((s) => s.savings);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (settings.theme === 'dark') root.classList.add('dark');
    else if (settings.theme === 'light') root.classList.add('light');
  }, [settings.theme]);

  // Sync overlay conversations into the main app
  const importOverlay = useAppStore((s) => s.importOverlayConversation);
  useEffect(() => {
    if (!isTauri()) return;
    importOverlay();
    const interval = setInterval(importOverlay, 5000);
    return () => clearInterval(interval);
  }, [importOverlay]);

  // Fetch models once desktop setup is ready. In Tauri the backend may still be
  // starting during the first render, so loading before setup completes can
  // leave the picker permanently empty.
  useEffect(() => {
    if (!setupDone) return;
    let cancelled = false;
    setModelsLoading(true);
    fetchModels()
      .then((m) => {
        if (cancelled) return;
        setModels(m);
        const { settings: s, selectedModel: currentModel } = useAppStore.getState();
        if (!currentModel && m.length > 0) {
          const preferred = s.defaultModel && m.find((x) => x.id === s.defaultModel);
          setSelectedModel(preferred ? preferred.id : m[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setupDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch server info
  useEffect(() => {
    fetchServerInfo().then(setServerInfo).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll savings and optionally share to Supabase
  useEffect(() => {
    const refresh = () =>
      fetchSavings()
        .then((data) => {
          setSavings(data);
          if (optInEnabled && optInDisplayName && data) {
            const claudeEntry = data.per_provider.find(
              (p) => p.provider === 'claude-opus-4.6',
            );
            const dollarSavings = claudeEntry ? claudeEntry.total_cost : 0;
            const energySaved = data.per_provider.reduce(
              (sum, p) => sum + (p.energy_wh || 0),
              0,
            );
            const flopsSaved = data.per_provider.reduce(
              (sum, p) => sum + (p.flops || 0),
              0,
            );
            submitSavings({
              anon_id: optInAnonId,
              display_name: optInDisplayName,
              email: optInEmail,
              total_calls: data.total_calls,
              total_tokens: data.total_tokens,
              dollar_savings: dollarSavings,
              energy_wh_saved: energySaved,
              flops_saved: flopsSaved,
              token_counting_version: data.token_counting_version ?? 1,
            });
          }
        })
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [optInEnabled, optInDisplayName, optInAnonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show opt-in modal on first visit
  useEffect(() => {
    if (!optInModalSeen) {
      setOptInModalOpen(true);
      markOptInModalSeen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        toggleSystemPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, toggleSystemPanel]);

  // Desktop auto-update check — disabled during local development.
  // Re-enable for production releases by uncommenting below.
  // const updateChecked = useRef(false);
  // useEffect(() => {
  //   if (!isTauri() || updateChecked.current) return;
  //   updateChecked.current = true;
  //   (async () => {
  //     try {
  //       const { check } = await import('@tauri-apps/plugin-updater');
  //       const update = await check();
  //       if (update) {
  //         await update.downloadAndInstall();
  //         const { toast } = await import('sonner');
  //         toast.info('Update ready', {
  //           description: 'A new version has been downloaded. Restart to apply.',
  //           duration: Infinity,
  //           action: {
  //             label: 'Restart Now',
  //             onClick: async () => {
  //               const { relaunch } = await import('@tauri-apps/plugin-process');
  //               await relaunch();
  //             },
  //           },
  //         });
  //       }
  //     } catch {}
  //   })();
  // }, []);

  if (!setupDone) {
    return <SetupScreen onReady={handleSetupReady} />;
  }

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="get-started" element={<GetStartedPage />} />
          <Route path="data-sources" element={<DataSourcesPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="tasks" element={<BackgroundTasksPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="digest" element={<DailyDigestPage />} />
          <Route path="skills" element={<SkillsWorkflowsPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route path="diagnostics" element={<DiagnosticsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" />
      {commandPaletteOpen && <CommandPalette />}
      {optInModalOpen && (
        <OptInModal onClose={() => setOptInModalOpen(false)} />
      )}
    </>
  );
}
