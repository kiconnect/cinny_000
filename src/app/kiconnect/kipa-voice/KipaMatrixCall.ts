import { CallEvent, createNewMatrixCall, type MatrixCall, type MatrixClient } from 'matrix-js-sdk';

export type KipaCallStatus =
  | 'idle'
  | 'starting'
  | 'calling'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'error';

type KipaCallCallbacks = {
  onStatus: (status: KipaCallStatus) => void;
  onRemoteStream: (stream: MediaStream | undefined) => void;
  onError: (error: Error) => void;
};

type MatrixCallState = MatrixCall['state'];
type MatrixCallFeeds = ReturnType<MatrixCall['getFeeds']>;

const USER_HANGUP = 'user_hangup' as Parameters<MatrixCall['hangup']>[0];
const ENDED_STATE = 'ended' as MatrixCallState;

const toKipaCallStatus = (state: MatrixCallState): KipaCallStatus => {
  switch (state) {
    case 'invite_sent':
    case 'ringing':
      return 'calling';
    case 'connecting':
    case 'create_offer':
    case 'create_answer':
    case 'wait_local_media':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'ended':
      return 'ended';
    default:
      return 'starting';
  }
};

const callErrorToError = (callError: Error): Error =>
  new Error(callError.message || 'Die KIPA-Sprachverbindung ist fehlgeschlagen.');

export class KipaMatrixCall {
  private call?: MatrixCall;

  private readonly mx: MatrixClient;

  private readonly roomId: string;

  private readonly paUserId: string;

  private readonly callbacks: KipaCallCallbacks;

  public constructor(
    mx: MatrixClient,
    roomId: string,
    paUserId: string,
    callbacks: KipaCallCallbacks
  ) {
    this.mx = mx;
    this.roomId = roomId;
    this.paUserId = paUserId;
    this.callbacks = callbacks;
  }

  private readonly handleState = (state: MatrixCallState): void => {
    this.callbacks.onStatus(toKipaCallStatus(state));
  };

  private readonly handleFeedsChanged = (_feeds: MatrixCallFeeds, call: MatrixCall): void => {
    this.callbacks.onRemoteStream(call.remoteUsermediaStream);
  };

  private readonly handleError = (callError: Error): void => {
    this.callbacks.onStatus('error');
    this.callbacks.onError(callErrorToError(callError));
  };

  private readonly handleHangup = (): void => {
    this.callbacks.onRemoteStream(undefined);
    this.callbacks.onStatus('ended');
  };

  public async start(): Promise<void> {
    if (this.call) return;

    this.callbacks.onStatus('starting');
    const call = createNewMatrixCall(this.mx, this.roomId, { invitee: this.paUserId });
    if (!call) {
      throw new Error('WebRTC wird von diesem Browser nicht unterstützt.');
    }

    this.call = call;
    call.on(CallEvent.State, this.handleState);
    call.on(CallEvent.FeedsChanged, this.handleFeedsChanged);
    call.on(CallEvent.Error, this.handleError);
    call.on(CallEvent.Hangup, this.handleHangup);

    try {
      await call.placeVoiceCall();
    } catch (error) {
      this.dispose(false);
      throw error;
    }
  }

  public hangup(): void {
    if (!this.call) return;
    this.call.hangup(USER_HANGUP, false);
    this.dispose(false);
    this.callbacks.onRemoteStream(undefined);
    this.callbacks.onStatus('ended');
  }

  public dispose(sendHangup = true): void {
    const { call } = this;
    if (!call) return;

    this.call = undefined;
    call.off(CallEvent.State, this.handleState);
    call.off(CallEvent.FeedsChanged, this.handleFeedsChanged);
    call.off(CallEvent.Error, this.handleError);
    call.off(CallEvent.Hangup, this.handleHangup);

    if (sendHangup && call.state !== ENDED_STATE) {
      call.hangup(USER_HANGUP, false);
    }
  }
}
