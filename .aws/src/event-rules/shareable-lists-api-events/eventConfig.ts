export const eventConfig = {
  shareableList: {
    name: 'ShareableListEvents',
    source: 'shareable-list-events',
    detailType: [
      'shareable-list-created',
      'shareable-list-updated',
      'shareable-list-deleted',
      'shareable-list-hidden',
    ],
  },
  shareableListItem: {
    name: 'ShareableListItemEvents',
    source: 'shareable-list-item-events',
    detailType: ['shareable-list-item-created', 'shareable-list-item-deleted'],
  },
};
