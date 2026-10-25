// Diagnóstico: lista todos os dispositivos e os data points de cada um, para montar os controles
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Copy, Stethoscope } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { BackHeader } from '@/components/Header';
import { ErrorBanner, Loading } from '@/components/States';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { api } from '@/lib/api';

type DiagDevice = {
  device: { id: string; name: string; category: string; online: boolean; product_name?: string; status?: { code: string; value: unknown }[] };
  specification?: { functions: { code: string; type: string; values: Record<string, unknown> }[]; status: { code: string; type: string; values: Record<string, unknown> }[] };
  specification_error?: string;
};

type Diag = { device_count: number; base_url: string; devices: DiagDevice[]; scenes?: { name: string }[]; automations?: { name: string }[]; scenes_error?: string };

function describe(values: Record<string, unknown>) {
  if (Array.isArray(values.range)) return (values.range as string[]).join(', ');
  if (values.min !== undefined) {
    return `${values.min}–${values.max}${values.scale ? ` (escala ${values.scale})` : ''}${values.unit ? ` ${values.unit}` : ''}`;
  }
  return '';
}

export default function Diagnostico() {
  const toast = useToast();
  const [data, setData] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await api.diagnostics()) as unknown as Diag);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    const text = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
    else await Clipboard.setStringAsync(text);
    toast('Diagnóstico copiado');
  };

  return (
    <Screen>
      <BackHeader title="Diagnóstico" />
      <Txt variant="caption" className="mb-4">
        Consulta a Tuya e mostra cada dispositivo com seus data points (DPs). Use o botão de copiar para salvar o JSON
        completo.
      </Txt>
      <View className="mb-4 flex-row gap-3">
        <Button title={data ? 'Rodar de novo' : 'Rodar diagnóstico'} icon={Stethoscope} onPress={run} loading={loading} className="flex-1" />
        {data ? <Button title="Copiar JSON" icon={Copy} variant="secondary" onPress={copy} /> : null}
      </View>
      {error ? <ErrorBanner message={error} onRetry={run} /> : null}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <View className="gap-3">
          <Txt variant="label">
            {data.device_count} dispositivos · {data.base_url}
          </Txt>
          {data.devices.map(({ device, specification, specification_error }) => (
            <Card key={device.id} className="gap-3">
              <View>
                <Txt variant="heading">{device.name}</Txt>
                <Txt variant="caption">
                  {device.product_name ?? '—'} · categoria {device.category} · {device.online ? 'online' : 'offline'}
                </Txt>
                <Txt variant="caption" selectable>
                  id {device.id}
                </Txt>
              </View>
              <View className="gap-1">
                <Txt variant="label" className="text-sky">
                  Status atual
                </Txt>
                {(device.status ?? []).map((s) => (
                  <Txt key={s.code} variant="caption" selectable>
                    {s.code}: {JSON.stringify(s.value)}
                  </Txt>
                ))}
              </View>
              {specification ? (
                <View className="gap-1">
                  <Txt variant="label" className="text-amber">
                    Comandos aceitos
                  </Txt>
                  {specification.functions.length === 0 ? <Txt variant="caption">Nenhum comando no conjunto padrão</Txt> : null}
                  {specification.functions.map((f) => (
                    <Txt key={f.code} variant="caption" selectable>
                      {f.code} ({f.type}) {describe(f.values)}
                    </Txt>
                  ))}
                </View>
              ) : (
                <Txt variant="caption" className="text-danger">
                  Especificação indisponível: {specification_error}
                </Txt>
              )}
            </Card>
          ))}
          <Card className="gap-1">
            <Txt variant="heading">Cenas e automações</Txt>
            {data.scenes_error ? (
              <Txt variant="caption" className="text-danger">
                {data.scenes_error}
              </Txt>
            ) : (
              <>
                <Txt variant="caption">Cenas: {data.scenes?.map((s) => s.name).join(', ') || 'nenhuma'}</Txt>
                <Txt variant="caption">Automações: {data.automations?.map((s) => s.name).join(', ') || 'nenhuma'}</Txt>
              </>
            )}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
