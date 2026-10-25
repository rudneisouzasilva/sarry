import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Save } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { BackHeader, SectionTitle } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Empty } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Toggle } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { useDevice, useDevices } from '@/features/devices/DevicesProvider';
import { supabase } from '@/lib/supabase';
import type { DeviceKind } from '@/types';

type ChannelMeta = { name: string; room: string; hidden: boolean };

export default function EditarDispositivo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useDevices();
  const device = useDevice(id);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [kind, setKind] = useState<DeviceKind>('other');
  const [hidden, setHidden] = useState(false);
  const [channels, setChannels] = useState<Record<string, ChannelMeta>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!device) return;
    setName(device.name === device.tuyaName ? '' : device.name);
    setRoom(device.room ?? '');
    setKind(device.kind);
    setHidden(device.hidden);
    setChannels(
      Object.fromEntries(device.channels.map((c) => [c.code, { name: c.name, room: c.room ?? '', hidden: c.hidden }])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id]);

  if (!device) {
    return (
      <Screen>
        <BackHeader title="Dispositivo" />
        <Empty title="Dispositivo não encontrado" />
      </Screen>
    );
  }

  const multi = device.channels.length > 1;

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('devices')
      .update({
        custom_name: name.trim() || null,
        room: room.trim() || null,
        kind,
        hidden,
        channels: multi
          ? Object.fromEntries(
              Object.entries(channels).map(([code, m]) => [code, { name: m.name.trim() || undefined, room: m.room.trim() || undefined, hidden: m.hidden }]),
            )
          : {},
      })
      .eq('id', device.id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast('Dispositivo salvo');
    await refresh(true, true);
    router.back();
  };

  return (
    <Screen>
      <BackHeader title={device.name} />
      <Txt variant="caption" className="mb-4">
        Nome na Tuya: {device.tuyaName} · {device.productName ?? device.category}
      </Txt>
      <Card className="gap-4">
        <Field label="Nome no Sarry" value={name} onChangeText={setName} placeholder={device.tuyaName} />
        <Field label="Cômodo" value={room} onChangeText={setRoom} placeholder="ex.: Sala" />
        <View className="gap-1.5">
          <Txt variant="label" className="text-muted">
            Tipo
          </Txt>
          <Segmented
            label="Tipo"
            tone="amber"
            value={kind}
            onChange={(v) => setKind(v as DeviceKind)}
            options={[
              { value: 'light', label: 'Luz' },
              { value: 'ac', label: 'Ar' },
              { value: 'hub', label: 'Hub' },
              { value: 'other', label: 'Outro' },
            ]}
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Txt variant="body">Ocultar no app</Txt>
          <Toggle value={hidden} onChange={setHidden} label="Ocultar no app" />
        </View>
      </Card>

      {multi ? (
        <>
          <SectionTitle>Teclas</SectionTitle>
          <View className="gap-3">
            {device.channels.map((c, i) => {
              const meta = channels[c.code] ?? { name: '', room: '', hidden: false };
              const update = (patch: Partial<ChannelMeta>) => setChannels((all) => ({ ...all, [c.code]: { ...meta, ...patch } }));
              return (
                <Card key={c.code} className="gap-3">
                  <Txt variant="label">
                    Tecla {i + 1} ({c.code})
                  </Txt>
                  <Field label="Nome" value={meta.name} onChangeText={(t) => update({ name: t })} />
                  <Field label="Cômodo" value={meta.room} onChangeText={(t) => update({ room: t })} placeholder={room || 'ex.: Cozinha'} />
                  <View className="flex-row items-center justify-between">
                    <Txt variant="body">Ocultar esta tecla</Txt>
                    <Toggle value={meta.hidden} onChange={(v) => update({ hidden: v })} label={`Ocultar tecla ${i + 1}`} />
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

      <Button title="Salvar" icon={Save} loading={saving} onPress={submit} className="mt-6" />
    </Screen>
  );
}
