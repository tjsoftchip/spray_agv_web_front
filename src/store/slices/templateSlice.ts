import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface Template {
  id: string;
  name: string;
  description: string;
  yardId: string;
  yardName: string;
  yardShape: 'rectangle' | 'custom';
  yardDimensions: {
    length: number;
    width: number;
  };
  navigationPoints: any[];
  roadSegments: any[];
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateState {
  templates: Template[];
  currentTemplate: Template | null;
  loading: boolean;
  error: string | null;
}

const initialState: TemplateState = {
  templates: [],
  currentTemplate: null,
  loading: false,
  error: null,
};

const templateSlice = createSlice({
  name: 'template',
  initialState,
  reducers: {
    setTemplates: (state, action: PayloadAction<Template[]>) => {
      state.templates = action.payload;
    },
    setCurrentTemplate: (state, action: PayloadAction<Template | null>) => {
      state.currentTemplate = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setTemplates, setCurrentTemplate, setLoading, setError } = templateSlice.actions;
export default templateSlice.reducer;
