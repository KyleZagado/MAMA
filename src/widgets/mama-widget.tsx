import { HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetSnapshot } from './snapshot';

// Runs in the widget extension: everything it uses must be declared inside this function.
const MamaWidget = (props: WidgetSnapshot, environment: WidgetEnvironment) => {
  'widget';
  const muted = '#9AA3B2';
  const accent = '#4CB782';
  const white = '#FFFFFF';
  const open = widgetURL('mama://dashboard');
  const background = containerBackground('#111827', 'widget');

  if (!props.signedIn) {
    return (
      <VStack spacing={4} modifiers={[background, open]}>
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(white)]}>mama</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Open the app to sign in</Text>
      </VStack>
    );
  }

  const waterProgress = props.waterGoal > 0 ? Math.min(props.waterGlasses / props.waterGoal, 1) : 0;
  const tasksLine =
    props.tasksTotal === 0
      ? 'No tasks today'
      : props.tasksLeft === 0
        ? 'All tasks done'
        : `${props.tasksLeft} ${props.tasksLeft === 1 ? 'task' : 'tasks'} left`;

  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, open]}>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Total balance</Text>
        <Text
          modifiers={[
            font({ size: 24, weight: 'heavy' }),
            foregroundStyle(white),
            lineLimit(1),
            minimumScaleFactor(0.5),
          ]}
        >
          {props.balance}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(white)]}>{tasksLine}</Text>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent)]}>
          {`${props.waterGlasses} / ${props.waterGoal} glasses`}
        </Text>
      </VStack>
    );
  }

  return (
    <HStack alignment="top" spacing={16} modifiers={[background, open]}>
      <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 9999, alignment: 'topLeading' })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Balance</Text>
        <Text
          modifiers={[
            font({ size: 20, weight: 'heavy' }),
            foregroundStyle(white),
            lineLimit(1),
            minimumScaleFactor(0.5),
          ]}
        >
          {props.balance}
        </Text>
        {props.goalPercent !== null && (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(accent)]}>{`${props.goalPercent}% of goal`}</Text>
        )}
      </VStack>
      <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 9999, alignment: 'topLeading' })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Today</Text>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(white)]}>{tasksLine}</Text>
        {props.nextTasks.map((task) => (
          <Text
            key={task.title}
            modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}
          >
            {task.time ? `${task.time} · ${task.title}` : task.title}
          </Text>
        ))}
      </VStack>
      <VStack alignment="leading" spacing={6} modifiers={[frame({ maxWidth: 9999, alignment: 'topLeading' })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Water</Text>
        <Text modifiers={[font({ size: 20, weight: 'heavy' }), foregroundStyle(white)]}>
          {`${props.waterGlasses}/${props.waterGoal}`}
        </Text>
        <ProgressView value={waterProgress} modifiers={[padding({ trailing: 4 })]} />
      </VStack>
    </HStack>
  );
};

export default createWidget('MamaWidget', MamaWidget);
