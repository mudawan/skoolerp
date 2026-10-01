import React from 'react';
import { ActiveTab } from '../types';
import { SettingsView } from './SettingsView';

interface MonthEndWizardViewProps {
  initialMonth?: string;
  setActiveTab: (tab: ActiveTab) => void;
}

export const MonthEndWizardView: React.FC<MonthEndWizardViewProps> = ({
  initialMonth,
  setActiveTab,
}) => {
  return (
    <SettingsView
      viewMode="settings"
      initialSubTab="monthEnd"
      targetMonth={initialMonth}
      onNavigateToTab={(tab) => {
        setActiveTab(tab);
      }}
    />
  );
};
