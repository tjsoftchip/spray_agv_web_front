import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  priority: number;
  templateIds: string[];
  transitionSequence: string[];
  operationFrequency: any;
  executionParams: any;
  createdBy: string;
  startTime?: string;
  endTime?: string;
  progress: number;
  executionLogs: any[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TaskState {
  tasks: Task[];
  currentTask: Task | null;
  loading: boolean;
  error: string | null;
}

const initialState: TaskState = {
  tasks: [],
  currentTask: null,
  loading: false,
  error: null,
};

const taskSlice = createSlice({
  name: 'task',
  initialState,
  reducers: {
    setTasks: (state, action: PayloadAction<Task[]>) => {
      state.tasks = action.payload;
    },
    setCurrentTask: (state, action: PayloadAction<Task | null>) => {
      state.currentTask = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setTasks, setCurrentTask, setLoading, setError } = taskSlice.actions;
export default taskSlice.reducer;
