// Módulo nativo de rede local (só no APK de Android). Na web e no iOS ele não existe: devolve null.
import { requireOptionalNativeModule } from 'expo';

export type UdpPacket = { port: number; address: string; data: string };

type SarryLanModule = {
  listenUdp(ports: number[], durationMs: number): Promise<UdpPacket[]>;
  tcpOpen(host: string, port: number, timeoutMs: number): Promise<number>;
  tcpWrite(id: number, data: string): Promise<boolean>;
  tcpRead(id: number, timeoutMs: number): Promise<string | null>;
  tcpClose(id: number): Promise<boolean>;
};

export default requireOptionalNativeModule<SarryLanModule>('SarryLan');
