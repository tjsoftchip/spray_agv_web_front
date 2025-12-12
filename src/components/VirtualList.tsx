import React from 'react';

interface VirtualListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  width?: string | number;
}

function VirtualList<T>({ items, height, itemHeight, renderItem, width = '100%' }: VirtualListProps<T>) {
  return (
    <div
      style={{
        height,
        width,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {items.map((item, index) => (
        <div key={index} style={{ height: itemHeight }}>
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}

export default VirtualList;
