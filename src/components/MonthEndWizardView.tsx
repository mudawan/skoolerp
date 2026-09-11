import React from 'react';
import { ActiveTab } from '../types';
import { MonthEndWizardPanel } from './settings/MonthEndWizardPanel';

interface MonthEndWizardViewProps {
  initialMonth?: string;
  setActiveTab: (tab: ActiveTab) => void;
}

export const MonthEndWizardView: React.FC<MonthEndWizardViewProps> = ({
  initialMonth,
  setActiveTab,
}) => {
  return (
    <div className="space-y-6">
      <MonthEndWizardPanel
        initialMonth={initialMonth}
        onNavigateToTab={(tab) => {
          setActiveTab(tab);
        }}
      />
    </div>
  );
};
