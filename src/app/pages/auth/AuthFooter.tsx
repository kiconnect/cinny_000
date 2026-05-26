import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text
        as="a"
        size="T300"
        href="https://portal.kiconnect.at/legal/Impressum-Datenschutz"
        target="_blank"
        rel="noreferrer"
      >
        Impressum & Datenschutz
      </Text>
      <Text
        as="a"
        size="T300"
        href="https://github.com/cinnyapp/cinny"
        target="_blank"
        rel="noreferrer"
      >
        KIconnect powered by Cinny
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Matrix
      </Text>
    </Box>
  );
}
