import React, { ReactNode } from 'react';
import { Box } from 'folds';
import { PatientEntry } from '../../kiconnect/components/PatientEntry';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  return (
    <Box grow="Yes">
      <PatientEntry />
      <Box shrink="No">{nav}</Box>
      <Box grow="Yes">{children}</Box>
    </Box>
  );
}
