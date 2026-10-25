import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Minus, Plus, Power } from 'lucide-react-native';
import { Card } from '@/components/Card';
import { Dial } from '@/components/Dial';
import { BackHeader, SectionTitle } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Empty, Loading } from '@/components/States';
import { Toggle } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { IconButton } from '@/components/Button';
import { useAc } from '@/features/climate/useAc';
import { useDevice, useDevices } from '@/features/devices/DevicesProvider';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme/colors';

export default function ArCondicionado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loading, refreshing, refresh } = useDevices();
  const device = useDevice(id);
  const { caps, spec, isOn, target, current, setPower, nudgeTemp, send, value } = useAc(device, 'app', { withShadow: true });

  if (!device) {
    return (
      <Screen>
        <BackHeader title="Ar-condicionado" />
        {loading ? <Loading /> : <Empty title="Aparelho não encontrado" />}
      </Screen>
    );
  }

  const disabled = !device.online || !isOn;
  const temp = caps?.temp;

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(true)}>
      <BackHeader title={device.name} />
      {!device.online ? (
        <Txt variant="caption" className="mb-2 text-danger">
          Aparelho offline. Verifique o Wi-Fi do ar.
        </Txt>
      ) : null}

      <Card className="items-center py-6">
        <Dial value={target} min={temp ? temp.min / 10 ** temp.scale : 16} max={temp ? temp.max / 10 ** temp.scale : 30} current={current} active={isOn} unit={temp?.unit} />
        <View className="mt-4 w-full max-w-[360px] flex-row items-center justify-between px-4">
          <IconButton
            icon={Minus}
            label="Diminuir temperatura"
            onPress={() => {
              haptic.tap();
              nudgeTemp(-1);
            }}
            disabled={disabled || !temp}
            size={28}
            color={colors.sky}
            className="h-16 w-16 border border-line bg-card-alt"
          />
          <IconButton
            icon={Power}
            label={isOn ? 'Desligar o ar' : 'Ligar o ar'}
            onPress={() => {
              haptic.tap();
              setPower(!isOn);
            }}
            disabled={!device.online || !caps?.power}
            size={30}
            color={isOn ? colors.bg : colors.sky}
            className={`h-20 w-20 ${isOn ? 'bg-sky' : 'border border-sky/50 bg-card-alt'}`}
          />
          <IconButton
            icon={Plus}
            label="Aumentar temperatura"
            onPress={() => {
              haptic.tap();
              nudgeTemp(1);
            }}
            disabled={disabled || !temp}
            size={28}
            color={colors.sky}
            className="h-16 w-16 border border-line bg-card-alt"
          />
        </View>
      </Card>

      {!spec ? (
        <Txt variant="caption" className="mt-4 text-center">
          Carregando recursos do aparelho...
        </Txt>
      ) : null}

      {caps?.mode?.options.length ? (
        <>
          <SectionTitle>Modo</SectionTitle>
          <Segmented
            label="Modo"
            options={caps.mode.options}
            value={value(caps.mode.code) as string}
            onChange={(v) => send(caps.mode!.code, v, caps.mode!.via)}
            disabled={disabled}
          />
        </>
      ) : null}

      {caps?.fan?.options.length ? (
        <>
          <SectionTitle>Ventilação</SectionTitle>
          <Segmented
            label="Ventilação"
            options={caps.fan.options}
            value={value(caps.fan.code) as string}
            onChange={(v) => send(caps.fan!.code, v, caps.fan!.via)}
            disabled={disabled}
          />
        </>
      ) : null}

      {caps?.extras.length ? (
        <>
          <SectionTitle>Recursos</SectionTitle>
          <Card className="py-1">
            {caps.extras.map((x, i) => (
              <View key={x.code} className={`min-h-14 flex-row items-center justify-between ${i ? 'border-t border-line' : ''}`}>
                <Txt variant="body">{x.label}</Txt>
                <Toggle
                  value={value(x.code) === true}
                  onChange={(v) => send(x.code, v, x.via)}
                  label={x.label}
                  tone="sky"
                  disabled={disabled}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
