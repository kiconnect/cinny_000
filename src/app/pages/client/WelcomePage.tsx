import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '../../components/page';
import KIconnectLogo from '../../assets/ICON_1_3_2026_bkg_leer.png';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={
              <img
                width="90"
                height="60"
                src={KIconnectLogo}
                alt="KIconnect Logo"
                style={{ objectFit: 'contain' }}
              />
            }
            title="KIconnect Chat"
            subTitle={
              <span>
                KIconnect Chat basiert auf Cinny.{' '}
                <a
                  href="https://github.com/cinnyapp/cinny/releases"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Cinny v4.12.3
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href="https://github.com/cinnyapp/cinny"
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    Cinny Source Code
                  </Text>
                </Button>
                <Button
                  as="a"
                  href="https://portal.kiconnect.at/legal/Impressum-Datenschutz"
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={<Icon size="200" src={Icons.Info} />}
                >
                  <Text as="span" size="B400" truncate>
                    Impressum & Datenschutz
                  </Text>
                </Button>
              </Box>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
