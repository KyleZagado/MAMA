import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { lightColors as colors } from '../constants/theme';

type DragProps = {
  onStart: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: (x: number, y: number) => void;
  onCancel: () => void;
};

export class TaskDragHandle extends React.Component<DragProps> {
  private responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => this.props.onStart(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderMove: (_event, gesture) => this.props.onMove(gesture.moveX, gesture.moveY),
    onPanResponderRelease: (event, gesture) => this.props.onEnd(
      gesture.moveX || event.nativeEvent.pageX, gesture.moveY || event.nativeEvent.pageY),
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => this.props.onCancel(),
  });

  render() {
    return <View {...this.responder.panHandlers} style={styles.handle} accessibilityLabel="Drag task to a date or reorder in day view">
      <Ionicons name="reorder-three-outline" size={26} color={colors.textMuted} />
    </View>;
  }
}

const styles = StyleSheet.create({ handle: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
