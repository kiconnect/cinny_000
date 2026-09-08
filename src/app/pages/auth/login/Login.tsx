import React, { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { Link, useSearchParams } from 'react-router-dom';
import { SSOAction } from 'matrix-js-sdk';
import { useAuthFlows } from '../../../hooks/useAuthFlows';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { useParsedLoginFlows } from '../../../hooks/useParsedLoginFlows';
import { PasswordLoginForm } from './PasswordLoginForm';
import { SSOLogin } from '../SSOLogin';
import { TokenLogin } from './TokenLogin';
import { OrDivider } from '../OrDivider';
import { getLoginPath, getRegisterPath, withSearchParam } from '../../pathUtils';
import { usePathWithOrigin } from '../../../hooks/usePathWithOrigin';
import { LoginPathSearchParams } from '../../paths';
import { useClientConfig } from '../../../hooks/useClientConfig';
import * as css from '../styles.css';

const getLoginTokenSearchParam = () => {
  // when using hasRouter query params in existing route
  // gets ignored by react-router, so we need to read it ourself
  // we only need to read loginToken as it's the only param that
  // is provided by external entity. example: SSO login
  const parmas = new URLSearchParams(window.location.search);
  const loginToken = parmas.get('loginToken');
  return loginToken ?? undefined;
};

const useLoginSearchParams = (searchParams: URLSearchParams): LoginPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      loginToken: searchParams.get('loginToken') ?? undefined,
    }),
    [searchParams]
  );

export function Login() {
  const server = useAuthServer();
  const { hashRouter, hidePasswordLogin } = useClientConfig();
  const { loginFlows } = useAuthFlows();
  const [searchParams] = useSearchParams();
  const loginSearchParams = useLoginSearchParams(searchParams);
  const ssoRedirectUrl = usePathWithOrigin(getLoginPath(server));
  const loginTokenForHashRouter = getLoginTokenSearchParam();
  const absoluteLoginPath = usePathWithOrigin(getLoginPath(server));

  if (hashRouter?.enabled && loginTokenForHashRouter) {
    window.location.replace(
      withSearchParam(absoluteLoginPath, {
        loginToken: loginTokenForHashRouter,
      })
    );
  }

  const parsedFlows = useParsedLoginFlows(loginFlows.flows);

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Bei KIconnect anmelden
      </Text>
      {parsedFlows.token && loginSearchParams.loginToken && (
        <TokenLogin token={loginSearchParams.loginToken} />
      )}
      {parsedFlows.password && !hidePasswordLogin && (
        <>
          <PasswordLoginForm
            defaultUsername={loginSearchParams.username}
            defaultEmail={loginSearchParams.email}
          />
          <span data-spacing-node />
          {parsedFlows.sso && <OrDivider />}
        </>
      )}
      {parsedFlows.sso && (
        <>
          <Box className={css.KiconnectLoginInfo} direction="Column" gap="200">
            <Text size="L400">So geht es weiter:</Text>
            <Text size="T300">
              Wählen Sie „Bei KIconnect anmelden“ und bestätigen Sie die Anmeldung mit Ihrem
              Passkey.
            </Text>
            <Text size="T300">
              Bei der ersten Anmeldung zeigt der sichere Matrix-Server danach eine Seite mit der
              Schaltfläche „Continue“. Bitte bestätigen Sie dort einmalig mit „Continue“.
            </Text>
            <Text size="T300">
              Anschließend öffnet sich der KIconnect Chatclient. Wählen Sie dort Ihren persönlichen
              KIconnect-Raum; Teamzugänge sehen stattdessen ihre Teamräume.
            </Text>
            <Text
              as="a"
              size="T300"
              href="https://kiconnect.at/help"
              target="_blank"
              rel="noreferrer noopener"
            >
              Anleitungen: kiconnect.at/help
            </Text>
          </Box>
          <SSOLogin
            providers={parsedFlows.sso.identity_providers}
            redirectUrl={ssoRedirectUrl}
            action={SSOAction.LOGIN}
            saveScreenSpace={parsedFlows.password !== undefined && !hidePasswordLogin}
          />
          <span data-spacing-node />
        </>
      )}
      {(!parsedFlows.password || hidePasswordLogin) && !parsedFlows.sso && (
        <>
          <Text style={{ color: color.Critical.Main }}>
            {`This client does not support login on "${server}" homeserver. Password and SSO based login method not found.`}
          </Text>
          <span data-spacing-node />
        </>
      )}
      {!hidePasswordLogin && (
        <Text align="Center">
          Do not have an account? <Link to={getRegisterPath(server)}>Register</Link>
        </Text>
      )}
    </Box>
  );
}
