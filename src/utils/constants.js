// src/utils/constants.js

export const EVENT_CATEGORIES = {
  TRACK: '徑項',
  FIELD: '田項',
  RELAY: '接力'
};

export const GRADES = [
  { id: 'A', name: '甲組 (六年級)' },
  { id: 'B', name: '乙組 (五年級)' },
  { id: 'C', name: '丙組 (四年級)' },
  { id: 'D', name: '丁組 (三年級)' }
];

export const GENDERS = [
  { id: 'M', name: '男子' },
  { id: 'F', name: '女子' }
];

export const MASTER_EVENTS = [
  { id: '60M', name: '60米', category: EVENT_CATEGORIES.TRACK, lanes: 8 },
  { id: '100M', name: '100米', category: EVENT_CATEGORIES.TRACK, lanes: 8 },
  { id: 'LONG_JUMP', name: '跳遠', category: EVENT_CATEGORIES.FIELD, lanes: null },
  { id: 'SOFTBALL', name: '擲壘球', category: EVENT_CATEGORIES.FIELD, lanes: null },
  { id: 'WOODBALL', name: '擲木球', category: EVENT_CATEGORIES.FIELD, lanes: null }
];
