import React, { useState } from 'react';
import { Card, Button, Space, message } from 'antd';
import { DragOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TemplateDragSelectorProps {
  templates: any[];
  value?: string[];
  onChange?: (value: string[]) => void;
}

const SortableTemplateItem: React.FC<{
  id: string;
  template: any;
  onRemove: (id: string) => void;
}> = ({ id, template, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        size="small"
        style={{ marginBottom: 8, cursor: 'move' }}
        bodyStyle={{ padding: '12px' }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <DragOutlined {...listeners} style={{ cursor: 'grab', color: '#999' }} />
            <span>{template.name}</span>
          </Space>
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onRemove(id)}
          />
        </Space>
      </Card>
    </div>
  );
};

const TemplateDragSelector: React.FC<TemplateDragSelectorProps> = ({ templates, value = [], onChange }) => {
  const [selectedTemplates, setSelectedTemplates] = useState<any[]>(
    value.map(id => templates.find(t => t.id === id)).filter(Boolean)
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedTemplates.findIndex((t) => t.id === active.id);
      const newIndex = selectedTemplates.findIndex((t) => t.id === over.id);
      const newTemplates = arrayMove(selectedTemplates, oldIndex, newIndex);
      
      setSelectedTemplates(newTemplates);
      onChange?.(newTemplates.map(t => t.id));
    }
  };

  const handleAddTemplate = (template: any) => {
    if (selectedTemplates.some(t => t.id === template.id)) {
      message.warning('该模板已添加');
      return;
    }

    const newTemplates = [...selectedTemplates, template];
    setSelectedTemplates(newTemplates);
    onChange?.(newTemplates.map(t => t.id));
  };

  const handleRemoveTemplate = (id: string) => {
    const newTemplates = selectedTemplates.filter(t => t.id !== id);
    setSelectedTemplates(newTemplates);
    onChange?.(newTemplates.map(t => t.id));
  };

  const availableTemplates = templates.filter(
    t => !selectedTemplates.some(st => st.id === t.id)
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          {availableTemplates.map(template => (
            <Button
              key={template.id}
              icon={<PlusOutlined />}
              onClick={() => handleAddTemplate(template)}
            >
              {template.name}
            </Button>
          ))}
        </Space>
        {availableTemplates.length === 0 && (
          <div style={{ color: '#999', fontSize: 14 }}>
            所有模板已添加
          </div>
        )}
      </div>

      {selectedTemplates.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={selectedTemplates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {selectedTemplates.map((template) => (
              <SortableTemplateItem
                key={template.id}
                id={template.id}
                template={template}
                onRemove={handleRemoveTemplate}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {selectedTemplates.length === 0 && (
        <div style={{ 
          border: '1px dashed #d9d9d9', 
          borderRadius: '6px', 
          padding: '32px', 
          textAlign: 'center',
          color: '#999'
        }}>
          请选择操作模板
        </div>
      )}
    </div>
  );
};

export default TemplateDragSelector;