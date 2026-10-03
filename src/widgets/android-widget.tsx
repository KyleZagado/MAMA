import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetSnapshot } from './snapshot';

const BAR_WIDTH = 100;

export function MamaAndroidWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  const waterPercent =
    snapshot.waterGoal > 0 ? Math.min(snapshot.waterGlasses / snapshot.waterGoal, 1) : 0;
  const tasksLine =
    snapshot.tasksTotal === 0
      ? 'No tasks today'
      : snapshot.tasksLeft === 0
        ? 'All tasks done'
        : `${snapshot.tasksLeft} ${snapshot.tasksLeft === 1 ? 'task' : 'tasks'} left`;

  if (!snapshot.signedIn) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          height: 'match_parent',
          backgroundColor: '#111827',
          borderRadius: 24,
          padding: 16,
          justifyContent: 'center',
        }}
      >
        <TextWidget text="mama" style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }} />
        <TextWidget text="Open the app to sign in" style={{ fontSize: 12, color: '#9AA3B2' }} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        backgroundColor: '#111827',
        borderRadius: 24,
        padding: 16,
      }}
    >
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text="Balance" style={{ fontSize: 11, color: '#9AA3B2' }} />
        <TextWidget
          text={snapshot.balance}
          maxLines={1}
          style={{ fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' }}
        />
        {snapshot.goalPercent !== null && (
          <TextWidget text={`${snapshot.goalPercent}% of goal`} style={{ fontSize: 11, color: '#4CB782' }} />
        )}
      </FlexWidget>

      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text="Today" style={{ fontSize: 11, color: '#9AA3B2' }} />
        <TextWidget text={tasksLine} style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' }} />
        {snapshot.nextTasks.map((task) => (
          <TextWidget
            key={task.title}
            text={task.time ? `${task.time} · ${task.title}` : task.title}
            maxLines={1}
            style={{ fontSize: 11, color: '#9AA3B2' }}
          />
        ))}
      </FlexWidget>

      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text="Water" style={{ fontSize: 11, color: '#9AA3B2' }} />
        <TextWidget
          text={`${snapshot.waterGlasses}/${snapshot.waterGoal}`}
          style={{ fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' }}
        />
        <FlexWidget
          style={{
            width: BAR_WIDTH,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#374151',
            marginTop: 6,
          }}
        >
          <FlexWidget
            style={{
              width: Math.round(BAR_WIDTH * waterPercent),
              height: 6,
              borderRadius: 3,
              backgroundColor: '#4CB782',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
