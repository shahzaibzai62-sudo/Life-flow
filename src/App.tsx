import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Calendar, 
  ListTodo, 
  ShoppingCart, 
  BarChart2, 
  Clock, 
  Bell, 
  Trash2, 
  ChevronRight,
  MoreVertical,
  Check,
  Zap,
  Moon,
  Sun,
  LayoutGrid,
  Search,
  SearchX,
  Tag,
  Briefcase,
  User,
  GraduationCap,
  Heart,
  BellPlus,
  BellOff,
  BellRing,
  Volume2,
  Settings,
  ShieldCheck,
  Smartphone,
  HardDrive,
  Eraser,
  Power,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isSameDay, startOfToday, addDays, eachDayOfInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths } from 'date-fns';
import { Storage } from './lib/storage';
import { Database, Table } from './lib/database';
import { cn, SafeJSON, Validator } from './lib/utils';
import { SplashScreen } from './components/SplashScreen';

// --- Types ---

type Priority = 'low' | 'medium' | 'high';
type Category = 'Personal' | 'Study' | 'Work' | 'Health' | 'Shopping';
type RepeatType = 'none' | 'daily' | 'weekly';

interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  category: Category;
  date: string;
  time?: string;
  reminder?: boolean;
}

interface Routine {
  id: string;
  title: string;
  time: string;
  days: number[]; // 0-6 (Sun-Sat)
  completed: string[]; // dates of completion
}

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  category?: string;
}

interface ShoppingList {
  id: string;
  title: string;
  items: ShoppingItem[];
}

interface Reminder {
  id: string;
  title: string;
  description?: string;
  time: string; // "HH:mm"
  active: boolean;
  repeat: RepeatType;
  days?: number[]; // [0-6] for weekly
  lastTriggered?: string; // Date string to prevent double fire
  sound?: string; // custom sound identifier
}

interface AppNotification {
  id: string;
  title: string;
  description?: string;
  time: string;
  type: 'reminder' | 'task';
  originalId: string;
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const ToastContext = React.createContext<{
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}>({ addToast: () => {} });

const useToast = () => React.useContext(ToastContext);

// --- Components ---

const Toast = ({ toast }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
    className={cn(
      "fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border backdrop-blur-md",
      toast.type === 'success' && "bg-emerald-500/90 border-emerald-400 text-white",
      toast.type === 'error' && "bg-rose-500/90 border-rose-400 text-white",
      toast.type === 'info' && "bg-indigo-600/90 border-indigo-500 text-white"
    )}
  >
    {toast.type === 'success' && <CheckCircle2 size={18} />}
    {toast.type === 'error' && <BellOff size={18} />}
    {toast.type === 'info' && <Zap size={18} />}
    <span className="text-sm font-bold tracking-tight">{toast.message}</span>
  </motion.div>
);

const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const variants: any = {
    primary: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 active:bg-indigo-700',
    secondary: 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 active:bg-slate-200 dark:active:bg-slate-700',
    ghost: 'bg-transparent text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800',
    outline: 'bg-transparent border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 active:bg-slate-50 dark:active:bg-slate-900'
  };
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-2xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base", 
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};

const Card = ({ children, className, ...props }: any) => (
  <motion.div 
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    whileHover={{ y: -2 }}
    transition={{ type: "spring", damping: 25, stiffness: 300 }}
    className={cn(
      "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-[2.5rem] shadow-sm",
      className
    )}
    {...props}
  >
    {children}
  </motion.div>
);

const showNativeNotification = (title: string, body?: string) => {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
};

const playNotificationSound = () => {
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.5;
    audio.play();
  } catch (error) {
    console.error("Audio playback blocked", error);
  }
};

const NotificationAlert = ({ notification, onDismiss, onAction }: { notification: AppNotification; onDismiss: () => void; onAction: (id: string, action: 'complete' | 'snooze') => void }) => {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 20, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-40px)] max-w-[380px]"
    >
      <Card className="bg-slate-900 border-indigo-500/50 border-2 shadow-2xl p-6 flex flex-col gap-5 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/20">
            <BellRing size={28} className="animate-[pulse_1s_infinite]" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">
              {notification.type === 'task' ? 'Task Due Now' : 'LifeFlow Reminder'}
            </p>
            <h4 className="text-lg font-bold text-white truncate">{notification.title}</h4>
            <p className="text-xs text-slate-400 font-medium">Scheduled for {notification.time}</p>
          </div>
          <div className="text-indigo-500 group cursor-pointer" onClick={playNotificationSound}>
            <Volume2 size={24} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 relative z-10">
          <Button variant="secondary" onClick={() => onAction(notification.originalId, 'snooze')} className="rounded-2xl border-none bg-slate-800 text-slate-300 h-14 hover:bg-slate-700">
            Snooze 5m
          </Button>
          <Button onClick={() => onAction(notification.originalId, 'complete')} className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 h-14 shadow-xl shadow-indigo-500/30">
            {notification.type === 'task' ? 'Complete' : 'Got it'}
          </Button>
        </div>
        <button 
          onClick={onDismiss}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </Card>
    </motion.div>
  );
};

const categoryIcons:Record<Category, any> = {
  Personal: User,
  Study: GraduationCap,
  Work: Briefcase,
  Health: Heart,
  Shopping: ShoppingCart
};

// --- Optimized Components with Memo ---
const TabHome = React.memo(({ routines, setRoutines, tasks, toggleTask, reminders, setReminders, lists }: any) => {
  const { addToast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = tasks.filter((t: any) => t.date === today);
  const progress = useMemo(() => {
    if (todayTasks.length === 0) return 0;
    return Math.round((todayTasks.filter((t: any) => t.completed).length / todayTasks.length) * 100);
  }, [todayTasks]);

  const toggleRoutine = (id: string) => {
    setRoutines(routines.map((r: any) => {
      if (r.id === id) {
        const isCompletedToday = r.completed.includes(today);
        return {
          ...r,
          completed: isCompletedToday 
            ? r.completed.filter((d: string) => d !== today)
            : [...r.completed, today]
        };
      }
      return r;
    }));
  };

  const toggleReminder = (id: string) => {
    setReminders(reminders.map((r: any) => r.id === id ? { ...r, active: !r.active } : r));
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-24"
    >
      <motion.header variants={itemVariants} className="px-4">
        <div className="flex justify-between items-center mb-1">
          <h1 className="text-3xl font-bold font-display tracking-tight dark:text-white">LifeFlow</h1>
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
            <Zap size={20} fill="currentColor" />
          </div>
        </div>
        <p className="text-slate-500 dark:text-slate-400 font-medium">Hello! Your day is {progress}% complete.</p>
      </motion.header>

      {/* Progress Card */}
      <motion.section variants={itemVariants} className="px-4">
        <Card className="bg-indigo-600 text-white border-none shadow-xl shadow-indigo-500/30 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-indigo-100 text-sm font-medium mb-1">Total Progress</p>
                <div className="flex items-end gap-2">
                  <h2 className="text-4xl font-bold">{progress}%</h2>
                </div>
              </div>
              <div className="p-2 bg-white/20 rounded-xl">
                <BarChart2 size={24} />
              </div>
            </div>
            <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-white rounded-full"
              />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </Card>
      </motion.section>

      {/* Shopping Summary */}
      {lists.length > 0 && (
        <motion.section variants={itemVariants} className="px-4">
          <Card className="bg-slate-900 dark:bg-slate-900 border-none flex items-center gap-4 py-4 px-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ShoppingCart size={22} />
            </div>
            <div className="flex-1">
              <h4 className="text-white text-sm font-bold">Shopping Lists</h4>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.05em]">{lists.length} lists total</p>
            </div>
            <div className="flex -space-x-2">
              {lists.slice(0, 3).map((l: any, i: number) => (
                <div key={l.id} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white" style={{ zIndex: 10 - i }}>
                  {l.items.length}
                </div>
              ))}
            </div>
          </Card>
        </motion.section>
      )}

      {/* Daily Routines */}
      <motion.section variants={itemVariants} className="px-4 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold dark:text-white">Daily Routines</h3>
          <button 
            onClick={() => addToast("You are tracking all your routines here!", "info")}
            className="text-indigo-600 dark:text-indigo-400 text-sm font-semibold hover:underline"
          >
            See all
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {routines.map((routine: any) => {
            const completed = routine.completed.includes(today);
            return (
              <Card 
                key={routine.id} 
                className={cn(
                  "p-4 flex flex-col items-center justify-center text-center gap-3 transition-all",
                  completed ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800" : ""
                )}
                onClick={() => toggleRoutine(routine.id)}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                  completed ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                )}>
                  {completed ? <Check size={24} strokeWidth={3} /> : <Clock size={24} />}
                </div>
                <div>
                  <p className="font-bold text-sm dark:text-white mb-0.5">{routine.title}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{routine.time}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </motion.section>

      {/* Today's Tasks */}
      <motion.section variants={itemVariants} className="px-4 space-y-4">
        <h3 className="text-xl font-bold dark:text-white">Today's Focus</h3>
        <div className="space-y-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 content-start">
          {todayTasks.length === 0 ? (
            <div className="col-span-full text-center py-10 text-slate-400">No tasks for today. Add one!</div>
          ) : (
            todayTasks.slice(0, 6).map((task: any) => (
              <Card key={task.id} className="p-4 flex items-center gap-4 group h-fit">
                <button onClick={() => toggleTask(task.id)} className="shrink-0">
                  {task.completed ? (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  ) : (
                    <Circle size={24} className="text-slate-300 dark:text-slate-700" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {task.category && React.createElement(categoryIcons[task.category as Category] || Tag, { size: 10, className: "text-primary" })}
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{task.category}</span>
                  </div>
                  <p className={cn(
                    "font-bold transition-all text-sm",
                    task.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"
                  )}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "w-1 h-1 rounded-full",
                      task.priority === 'high' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{task.priority} Priority</span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Card>
            ))
          )}
        </div>
      </motion.section>

      {/* Reminders */}
      <motion.section variants={itemVariants} className="px-4 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold dark:text-white">Reminders</h3>
          <Bell size={20} className="text-slate-400" />
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {reminders.map((reminder: any) => (
            <Card 
              key={reminder.id} 
              className={cn(
                "min-w-[160px] p-5 flex flex-col gap-4 border-none shadow-lg transition-all",
                reminder.active ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/50 opacity-60"
              )}
            >
              <div className="flex justify-between items-start">
                <div className={cn(
                  "p-2 rounded-xl",
                  reminder.active ? "bg-amber-100 text-amber-600" : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                )}>
                  <Bell size={18} />
                </div>
                <button 
                  onClick={() => toggleReminder(reminder.id)}
                  className={cn(
                    "w-10 h-6 rounded-full relative transition-colors",
                    reminder.active ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                    reminder.active ? "left-5" : "left-1"
                  )} />
                </button>
              </div>
              <div>
                <p className="font-bold text-sm dark:text-white truncate">{reminder.title}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{reminder.time}</p>
              </div>
            </Card>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
});

const TaskSkeleton = () => (
  <div className="space-y-3 px-6">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-5 flex items-center gap-4 animate-pulse">
        <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-2 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

const TabTasks = React.memo(({ tasks, setTasks }: any) => {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  
  const [newTask, setNewTask] = useState<Partial<Task>>({ 
    title: '', 
    description: '',
    priority: 'medium', 
    category: 'Personal',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '12:00',
    reminder: false
  });

  useEffect(() => {
    setIsFiltering(true);
    const timer = setTimeout(() => setIsFiltering(false), 300);
    return () => clearTimeout(timer);
  }, [search, filter, categoryFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t: Task) => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                           (t.description?.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = filter === 'all' ? true : filter === 'completed' ? t.completed : !t.completed;
      const matchesCategory = categoryFilter === 'all' ? true : t.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    }).sort((a: Task, b: Task) => {
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      return 0;
    });
  }, [tasks, search, filter, categoryFilter]);

  const saveTask = () => {
    // Input validation
    if (!Validator.isValidString(newTask.title, 1, 100)) {
      addToast("Please enter a valid task title", "error");
      return;
    }
    
    const sanitizedTask = {
      ...newTask,
      title: newTask.title?.trim(),
      description: newTask.description?.trim()
    };

    if (editingTask) {
      setTasks(tasks.map((t: Task) => t.id === editingTask.id ? { ...t, ...sanitizedTask } : t));
      addToast("Task updated successfully", "success");
    } else {
      const task: Task = {
        id: Date.now().toString(),
        title: sanitizedTask.title || '',
        description: sanitizedTask.description,
        completed: false,
        priority: (sanitizedTask.priority as Priority) || 'medium',
        category: (sanitizedTask.category as Category) || 'Personal',
        date: sanitizedTask.date || format(new Date(), 'yyyy-MM-dd'),
        time: sanitizedTask.time,
        reminder: sanitizedTask.reminder
      };
      setTasks([...tasks, task]);
      addToast("Task created!", "success");
    }
    
    closeModal();
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTask(null);
    setNewTask({ 
      title: '', 
      description: '',
      priority: 'medium', 
      category: 'Personal',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: '12:00',
      reminder: false
    });
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewTask({ ...task });
    setShowModal(true);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t: any) => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t: any) => t.id !== id));
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-24 h-full"
    >
      <motion.header variants={itemVariants} className="px-6 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Tasks</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Manage your daily goals</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="w-12 h-12 p-0 flex items-center justify-center rounded-2xl shadow-xl shadow-primary/30">
          <Plus size={24} />
        </Button>
      </motion.header>

      {/* Search Bar */}
      <motion.div variants={itemVariants} className="px-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900/50 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white outline-indigo-500 transition-all"
          />
        </div>
      </motion.div>

      {/* Filters Container */}
      <motion.div variants={itemVariants} className="space-y-4">
        {/* Status Filters */}
        <div className="px-6 flex gap-2 overflow-x-auto no-scrollbar">
          {['all', 'pending', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap relative",
                filter === f 
                  ? "text-white" 
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              {filter === f && (
                <motion.div 
                  layoutId="task-status-pill"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{f}</span>
            </button>
          ))}
        </div>

        {/* Category Filters */}
        <div className="px-6 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap relative",
              categoryFilter === 'all' 
                ? "text-white dark:text-slate-900" 
                : "text-slate-500"
            )}
          >
            {categoryFilter === 'all' && (
              <motion.div 
                layoutId="task-category-pill"
                className="absolute inset-0 bg-slate-900 dark:bg-white rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">All Categories</span>
          </button>
          {Object.keys(categoryIcons).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat as Category)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 relative",
                categoryFilter === cat 
                  ? "text-white dark:text-slate-900" 
                  : "text-slate-500"
              )}
            >
              {categoryFilter === cat && (
                <motion.div 
                  layoutId="task-category-pill"
                  className="absolute inset-0 bg-slate-900 dark:bg-white rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{cat}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Task List */}
      <div className="px-6 space-y-3 min-h-[300px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 items-start">
        {isFiltering ? (
          <div className="col-span-full">
            <TaskSkeleton />
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredTasks.length === 0 ? (
              <motion.div 
                 key="empty"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0 }}
                 className="col-span-full text-center py-20 flex flex-col items-center gap-4"
              >
                 <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-700">
                   <SearchX size={32} />
                 </div>
                 <p className="text-slate-400 font-bold text-sm">No tasks found</p>
              </motion.div>
            ) : (
              filteredTasks.map((task: Task) => {
                const Icon = categoryIcons[task.category] || Tag;
                return (
                  <motion.div
                    layout
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card 
                      className={cn(
                        "flex items-center gap-4 p-4 pr-2 border-none shadow-md",
                        task.completed ? "opacity-60 grayscale-[0.5]" : ""
                      )}
                      onClick={() => openEditModal(task)}
                    >
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} 
                      className="shrink-0 relative"
                    >
                      {task.completed ? (
                        <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-white scale-110 shadow-lg shadow-emerald-500/20">
                          <Check size={14} strokeWidth={4} />
                        </div>
                      ) : (
                        <div className={cn(
                          "w-6 h-6 rounded-lg border-2 transition-all",
                          task.priority === 'high' ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20' : 
                          task.priority === 'medium' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 
                          'border-slate-200 dark:border-slate-800'
                        )} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon size={12} className="text-primary" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{task.category}</span>
                      </div>
                      <p className={cn(
                        "font-bold truncate text-sm",
                        task.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-white"
                      )}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-slate-400">
                          <Calendar size={10} />
                          <span className="text-[9px] font-bold uppercase tracking-widest">{task.date === format(new Date(), 'yyyy-MM-dd') ? 'Today' : task.date}</span>
                        </div>
                        {task.time && (
                          <div className="flex items-center gap-1 text-slate-400">
                            <Clock size={10} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">{task.time}</span>
                          </div>
                        )}
                        <div className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.1em]",
                          task.priority === 'high' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' : 
                          task.priority === 'medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 
                          'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        )}>
                          {task.priority}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} 
                      className="text-slate-200 dark:text-slate-800 hover:text-rose-500 p-2 transition-colors shrink-0"
                    >
                      <Trash2 size={18} />
                    </button>
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
        )}
      </div>

      {/* Task Modal (Repurposed for Add and Edit) */}
      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] p-4 flex items-end justify-center"
            onClick={closeModal}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-[#020617] w-full max-w-md rounded-[3rem] p-6 sm:p-8 space-y-6 sm:space-y-8 shadow-2xl border border-white/10 flex flex-col h-[90vh] sm:h-auto"
              onClick={e => e.stopPropagation()}
            >
              <header className="flex justify-between items-center shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-2xl font-bold dark:text-white">{editingTask ? 'Edit Task' : 'New Task'}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">LifeFlow Productivity</p>
                </div>
                <button onClick={closeModal} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:rotate-90 transition-all">
                  <Plus size={24} className="rotate-45" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 sm:space-y-8 pb-4">
                <div className="space-y-4">
                  <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2 block group-focus-within:text-primary transition-colors">Task Content</label>
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="What are you planning?"
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-primary rounded-2xl p-4 text-slate-900 dark:text-white font-bold outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700"
                      value={newTask.title}
                      onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                    />
                  </div>
                  
                  <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2 block group-focus-within:text-primary transition-colors">Description (Optional)</label>
                    <textarea 
                      placeholder="Add more details about this task..."
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-primary rounded-2xl p-4 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none transition-all resize-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
                      value={newTask.description}
                      onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Due Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="date" 
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-2xl p-4 pl-12 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-primary/20 transition-all appearance-none"
                        value={newTask.date}
                        onChange={e => setNewTask({ ...newTask, date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Time</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="time" 
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-2xl p-4 pl-12 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-primary/20 transition-all appearance-none"
                        value={newTask.time}
                        onChange={e => setNewTask({ ...newTask, time: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl transition-colors",
                      newTask.reminder ? "bg-primary/10 text-primary" : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                    )}>
                      <Bell size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold dark:text-white">Enable Reminder</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Get notified on time</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setNewTask(prev => ({ ...prev, reminder: !prev.reminder }))}
                    className={cn(
                      "w-12 h-7 rounded-full relative transition-all duration-300 ease-in-out",
                      newTask.reminder ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                    )}
                  >
                    <motion.div 
                      animate={{ x: newTask.reminder ? 22 : 4 }}
                      className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(categoryIcons).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setNewTask({ ...newTask, category: cat as Category })}
                        className={cn(
                          "py-3 rounded-xl text-[10px] font-bold tracking-widest transition-all flex flex-col items-center gap-2 border-2",
                          newTask.category === cat 
                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                            : "bg-transparent border-slate-50 dark:border-slate-900 text-slate-400 hover:border-slate-100 dark:hover:border-slate-800"
                        )}
                      >
                        {React.createElement(categoryIcons[cat as Category] || Tag, { size: 16 })}
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Priority Level</label>
                  <div className="flex gap-2">
                    {['low', 'medium', 'high'].map(p => (
                      <button
                        key={p}
                        onClick={() => setNewTask({ ...newTask, priority: p as Priority })}
                        className={cn(
                          "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2",
                          newTask.priority === p 
                            ? "bg-slate-950 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-xl scale-[1.02]" 
                            : "bg-transparent border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                <Button variant="secondary" onClick={closeModal} className="h-14 rounded-2xl">
                  Cancel
                </Button>
                <Button onClick={saveTask} className="h-14 rounded-2xl shadow-xl shadow-primary/30">
                  {editingTask ? 'Save Task' : 'Create Task'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const itemCategories = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Bakery', 'Frozen', 'Household', 'Health', 'Other'];

const TabLists = React.memo(({ lists, setLists }: any) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newItemCategory, setNewItemCategory] = useState('Produce');
  const [newItemText, setNewItemText] = useState('');

  const activeList = lists.find((l: any) => l.id === activeListId);

  const addList = () => {
    const list: ShoppingList = {
      id: Date.now().toString(),
      title: 'New List',
      items: []
    };
    setLists([...lists, list]);
    setActiveListId(list.id);
  };

  const addItemToList = () => {
    if (!Validator.isValidString(newItemText, 1, 150)) return;
    
    setLists(lists.map((l: any) => {
      if (l.id === activeListId) {
        return {
          ...l,
          items: [...l.items, { 
            id: Date.now().toString(), 
            text: newItemText.trim(), 
            completed: false, 
            category: newItemCategory 
          }]
        };
      }
      return l;
    }));
    setNewItemText('');
  };

  const toggleItem = (itemId: string) => {
    setLists(lists.map((l: any) => {
      if (l.id === activeListId) {
        return {
          ...l,
          items: l.items.map((i: any) => i.id === itemId ? { ...i, completed: !i.completed } : i)
        };
      }
      return l;
    }));
  };

  const deleteItem = (itemId: string) => {
    setLists(lists.map((l: any) => {
      if (l.id === activeListId) {
        return {
          ...l,
          items: l.items.filter((i: any) => i.id !== itemId)
        };
      }
      return l;
    }));
  };

  const deleteList = (id: string) => {
    setLists(lists.filter((l: any) => l.id !== id));
    setActiveListId(null);
  };

  const groupedItems = useMemo(() => {
    if (!activeList) return {};
    return activeList.items.reduce((acc: any, item: any) => {
      const cat = item.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [activeList]);

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-24 h-full"
    >
      <motion.header variants={itemVariants} className="px-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Shopping</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{lists.length} categorized lists</p>
        </div>
        <Button onClick={addList} className="w-12 h-12 p-0 flex items-center justify-center rounded-2xl shadow-xl shadow-emerald-500/20 bg-emerald-500 hover:bg-emerald-600">
          <Plus size={24} />
        </Button>
      </motion.header>

      {lists.length === 0 ? (
        <motion.div variants={itemVariants} className="px-6 text-center py-20 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-500">
            <ShoppingCart size={32} />
          </div>
          <p className="text-slate-400 font-bold text-sm">No shopping lists yet</p>
        </motion.div>
      ) : (
        <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {lists.map((list: any) => (
              <motion.div
                layout
                key={list.id}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <Card 
                  className="p-5 flex items-center gap-5 relative group border-none shadow-md dark:bg-slate-900 overflow-hidden"
                  onClick={() => setActiveListId(list.id)}
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0">
                    <ShoppingCart size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold dark:text-white text-lg mb-0.5 truncate">{list.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{list.items.length} Items</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{list.items.filter((i: any) => i.completed).length} Checked</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-300" />
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {activeListId && activeList && (
          <motion.div 
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 bg-white dark:bg-[#020617] z-[200] flex flex-col h-full"
          >
             <header className="flex justify-between items-center px-6 pt-12 pb-6 shrink-0 bg-white dark:bg-[#020617] border-b border-slate-100 dark:border-slate-800/50">
               <button onClick={() => setActiveListId(null)} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:scale-110 active:scale-95 transition-all">
                 <ChevronRight size={24} className="rotate-180" />
               </button>
               <input 
                  type="text" 
                  value={activeList.title} 
                  onChange={e => setLists(lists.map((l: any) => l.id === activeListId ? { ...l, title: e.target.value } : l))}
                  className="bg-transparent border-none outline-none font-bold text-center text-xl dark:text-white flex-1 mx-4 placeholder:text-slate-300"
               />
               <button 
                  onClick={() => deleteList(activeListId)}
                  className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl text-rose-500 hover:scale-110 active:scale-95 transition-all"
               >
                 <Trash2 size={24} />
               </button>
             </header>

             <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 p-6 pb-40">
               {activeList.items.length === 0 ? (
                 <div className="text-center py-20">
                   <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-200 dark:text-slate-800 mx-auto mb-4">
                     <Plus size={32} />
                   </div>
                   <p className="text-slate-400 font-bold text-sm">Add some items to get started</p>
                 </div>
               ) : (
                 Object.entries(groupedItems).map(([category, items]: [any, any]) => (
                   <div key={category} className="space-y-3">
                     <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">{category}</h4>
                     <div className="space-y-2">
                       <AnimatePresence mode="popLayout" initial={false}>
                         {items.map((item: any) => (
                           <motion.div 
                              key={item.id} 
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="relative group cursor-pointer"
                           >
                              {/* Static Swipe Action Background */}
                              <div className="absolute inset-0 bg-rose-500 rounded-2xl flex items-center justify-end px-6 text-white overflow-hidden pointer-events-none">
                                <Trash2 size={20} />
                              </div>

                              <motion.div
                                drag="x"
                                dragConstraints={{ left: -80, right: 0 }}
                                onDragEnd={(_, info) => {
                                  if (info.offset.x < -40) deleteItem(item.id);
                                }}
                                className="relative"
                              >
                                <Card className="p-4 flex items-center gap-4 border-none shadow-sm dark:bg-slate-900">
                                  <button 
                                    onClick={() => toggleItem(item.id)}
                                    className="shrink-0"
                                  >
                                    {item.completed ? (
                                      <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                        <Check size={14} strokeWidth={4} />
                                      </div>
                                    ) : (
                                      <div className="w-6 h-6 rounded-lg border-2 border-slate-200 dark:border-slate-800" />
                                    )}
                                  </button>
                                  <p className={cn(
                                    "font-bold text-base flex-1 truncate",
                                    item.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-white"
                                  )}>
                                    {item.text}
                                  </p>
                                </Card>
                              </motion.div>
                           </motion.div>
                         ))}
                       </AnimatePresence>
                     </div>
                   </div>
                 ))
               )}
             </div>

             <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white dark:from-[#020617] dark:via-[#020617] to-transparent pt-10 flex flex-col gap-4">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                  {itemCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setNewItemCategory(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border-2",
                        newItemCategory === cat 
                          ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                          : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      placeholder="Add an item..." 
                      value={newItemText}
                      onChange={e => setNewItemText(e.target.value)}
                      className="w-full bg-slate-100 dark:bg-slate-900/80 border-none rounded-3xl p-5 font-bold text-lg dark:text-white outline-none focus:ring-2 ring-emerald-500/20 transition-all placeholder:text-slate-400"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addItemToList();
                        }
                      }}
                    />
                  </div>
                  <Button 
                    className="w-16 h-16 rounded-3xl bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 shrink-0 p-0" 
                    onClick={addItemToList}
                  >
                    <Plus size={32} />
                  </Button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const TabSchedule = React.memo(({ tasks, toggleTask }: any) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(startOfToday());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const tasksForSelectedDate = tasks.filter((t: Task) => isSameDay(new Date(t.date), selectedDate));
  
  const hasTasksOnDate = (date: Date) => {
    return tasks.some((t: Task) => isSameDay(new Date(t.date), date));
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-24 px-6 h-full flex flex-col"
    >
      <motion.header variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Calendar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{format(currentMonth, 'MMMM yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500"><ChevronRight size={20} className="rotate-180" /></button>
          <button onClick={nextMonth} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500"><ChevronRight size={20} /></button>
        </div>
      </motion.header>

      {/* Calendar Grid */}
      <motion.div variants={itemVariants}>
        <Card className="p-4 border-none shadow-xl dark:bg-[#0F172A]/80 backdrop-blur-xl">
          <div className="grid grid-cols-7 mb-4">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, monthStart);
              const hasEvents = hasTasksOnDate(day);

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all",
                    isSelected ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10" : 
                    isToday ? "bg-indigo-50 dark:bg-indigo-900/20 text-primary font-bold" :
                    isCurrentMonth ? "text-slate-900 dark:text-slate-200" : "text-slate-300 dark:text-slate-700"
                  )}
                >
                  <span className="text-sm font-bold">{format(day, 'd')}</span>
                  {hasEvents && !isSelected && (
                    <div className={cn(
                      "absolute bottom-2 w-1 h-1 rounded-full",
                      isToday ? "bg-primary" : "bg-slate-400"
                    )} />
                  )}
                  {isSelected && (
                    <motion.div layoutId="calendar-ring" className="absolute inset-0 border-2 border-white/50 rounded-2xl" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Daily Tasks */}
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <motion.div variants={itemVariants} className="flex justify-between items-center px-1">
          <h3 className="text-lg font-bold dark:text-white">
            {isSameDay(selectedDate, new Date()) ? 'Today' : format(selectedDate, 'MMMM d')}
          </h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tasksForSelectedDate.length} Tasks</span>
        </motion.div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
          {tasksForSelectedDate.length === 0 ? (
            <motion.div variants={itemVariants} className="col-span-full text-center py-10">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center text-slate-200 dark:text-slate-800 mx-auto mb-3">
                <Calendar size={24} />
              </div>
              <p className="text-slate-400 text-xs font-medium">No tasks scheduled for this day</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {tasksForSelectedDate.map((task: Task) => (
                <motion.div
                  layout
                  key={task.id}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  <Card className="p-4 flex items-center gap-4 border-none shadow-sm dark:bg-[#1E293B]/50 hover:bg-slate-50 dark:hover:bg-[#1E293B]">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0">
                      {task.completed ? (
                        <div className="w-5 h-5 rounded bg-emerald-500 text-white flex items-center justify-center"><Check size={12} strokeWidth={4} /></div>
                      ) : (
                        <div className="w-5 h-5 rounded border-2 border-slate-200 dark:border-slate-700" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold truncate dark:text-white", task.completed && "line-through text-slate-400")}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock size={10} className="text-slate-400" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{task.time || 'All Day'}</span>
                      </div>
                    </div>
                    <div className={cn(
                      "w-1 h-8 rounded-full",
                      task.priority === 'high' ? 'bg-rose-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// --- Reminders Tab ---

const TabReminders = React.memo(({ reminders, setReminders }: any) => {
  const { addToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [newReminder, setNewReminder] = useState<Partial<Reminder>>({
    title: '',
    description: '',
    time: '08:00',
    active: true,
    repeat: 'none',
    days: []
  });

  const saveReminder = () => {
    if (!Validator.isValidString(newReminder.title, 1, 100)) {
      addToast("Please enter a valid title.", "error");
      return;
    }

    const sanitizedReminder = {
      ...newReminder,
      title: newReminder.title?.trim(),
      description: newReminder.description?.trim()
    };

    if (editingReminder) {
      setReminders(reminders.map((r: Reminder) => r.id === editingReminder.id ? { ...r, ...sanitizedReminder } : r));
      addToast("Reminder updated", "success");
    } else {
      const reminder: Reminder = {
        id: Date.now().toString(),
        title: sanitizedReminder.title || '',
        description: sanitizedReminder.description,
        time: sanitizedReminder.time || '08:00',
        active: true,
        repeat: sanitizedReminder.repeat || 'none',
        days: sanitizedReminder.days || []
      };
      setReminders([...reminders, reminder]);
      addToast("Reminder set!", "success");
    }
    closeModal();
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReminder(null);
    setNewReminder({ title: '', description: '', time: '08:00', active: true, repeat: 'none', days: [] });
  };

  const openEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setNewReminder({ ...reminder });
    setShowModal(true);
  };

  const deleteReminder = (id: string) => {
    setReminders(reminders.filter((r: Reminder) => r.id !== id));
  };

  const toggleDay = (day: number) => {
    const currentDays = newReminder.days || [];
    if (currentDays.includes(day)) {
      setNewReminder({ ...newReminder, days: currentDays.filter(d => d !== day) });
    } else {
      setNewReminder({ ...newReminder, days: [...currentDays, day] });
    }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-24 h-full px-6"
    >
      <motion.header variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Reminders</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Smart local notifications</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="w-12 h-12 p-0 flex items-center justify-center rounded-2xl shadow-xl shadow-amber-500/20 bg-amber-500 hover:bg-amber-600">
          <BellPlus size={24} />
        </Button>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reminders.length === 0 ? (
          <motion.div variants={itemVariants} className="col-span-full text-center py-20 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-amber-500">
              <BellOff size={32} />
            </div>
            <p className="text-slate-400 font-bold text-sm">No reminders set</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {reminders.map((reminder: Reminder) => (
              <motion.div
                layout
                key={reminder.id}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <Card 
                  className={cn(
                    "p-5 border-none shadow-md transition-all flex items-center gap-4",
                    !reminder.active && "opacity-60 grayscale-[0.5]"
                  )}
                  onClick={() => openEdit(reminder)}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                    reminder.active ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  )}>
                    <Bell size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm dark:text-white truncate">{reminder.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">{reminder.time}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">• {reminder.repeat}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-xs">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setReminders(reminders.map((r: any) => r.id === reminder.id ? { ...r, active: !r.active } : r));
                      }}
                      className={cn(
                        "w-10 h-6 rounded-full relative transition-all",
                        reminder.active ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-800"
                      )}
                    >
                      <div className={cn(
                            "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                            reminder.active ? "left-5" : "left-1"
                          )} />
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] p-4 flex items-end justify-center"
            onClick={closeModal}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white dark:bg-[#020617] w-full max-w-md rounded-[3rem] p-8 space-y-6 shadow-2xl border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <header className="flex justify-between items-center">
                <h3 className="text-2xl font-bold dark:text-white">{editingReminder ? 'Edit Reminder' : 'New Reminder'}</h3>
                <button onClick={closeModal} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500"><Plus size={24} className="rotate-45" /></button>
              </header>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Reminder Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Drink some water"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-2xl p-4 text-slate-900 dark:text-white font-bold outline-none"
                    value={newReminder.title}
                    onChange={e => setNewReminder({ ...newReminder, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Alert Time</label>
                  <input 
                    type="time" 
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-2xl p-4 text-xl font-black text-slate-900 dark:text-white outline-none"
                    value={newReminder.time}
                    onChange={e => setNewReminder({ ...newReminder, time: e.target.value })}
                  />
                </div>

                <div className="space-y-3">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Repeat Cycle</label>
                   <div className="flex gap-2">
                     {['none', 'daily', 'weekly'].map((r) => (
                       <button
                         key={r}
                         onClick={() => setNewReminder({ ...newReminder, repeat: r as RepeatType })}
                         className={cn(
                           "flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2",
                           newReminder.repeat === r ? "bg-amber-500 border-amber-500 text-white" : "border-slate-100 dark:border-slate-800 text-slate-500"
                         )}
                       >
                         {r}
                       </button>
                     ))}
                   </div>
                </div>

                {newReminder.repeat === 'weekly' && (
                  <div className="flex justify-between px-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all",
                          newReminder.days?.includes(i) ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {editingReminder && (
                  <Button variant="secondary" onClick={() => { deleteReminder(editingReminder.id); closeModal(); }} className="h-14 rounded-2xl text-rose-500">
                    Delete
                  </Button>
                )}
                <Button onClick={saveReminder} className={cn("h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-500/20", !editingReminder && "col-span-2")}>
                  {editingReminder ? 'Save Changes' : 'Set Reminder'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const TabInsights = ({ tasks }: any) => {
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-24 px-4 h-full overflow-y-auto"
    >
      <motion.header variants={itemVariants}>
        <h2 className="text-3xl font-bold dark:text-white">Insights</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Your productivity journey</p>
      </motion.header>

      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-100 dark:bg-slate-900 border-none text-center p-6">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Completed</p>
           <h4 className="text-4xl font-bold dark:text-white">{completedTasks}</h4>
           <div className="mt-2 text-[10px] font-bold text-emerald-500">+12% this week</div>
        </Card>
        <Card className="bg-slate-100 dark:bg-slate-900 border-none text-center p-6">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Accuracy</p>
           <h4 className="text-4xl font-bold dark:text-white">{completionRate}%</h4>
           <div className="mt-2 text-[10px] font-bold text-indigo-500">Peak performance</div>
        </Card>
        <Card className="bg-slate-100 dark:bg-slate-900 border-none text-center p-6 sm:col-span-2">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Active Streak</p>
           <h4 className="text-4xl font-bold dark:text-white">7 Days</h4>
           <div className="mt-2 text-[10px] font-bold text-amber-500">Consistent behavior</div>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card title="Activity Level">
           <div className="h-40 flex items-end gap-3 px-2 pt-6">
              {[30, 45, 60, 40, 80, 55, 90].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    className={cn(
                      "w-full rounded-t-xl transition-all",
                      i === 6 ? "bg-indigo-600 shadow-lg shadow-indigo-500/20" : "bg-slate-100 dark:bg-slate-800"
                    )}
                  />
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{['M','T','W','T','F','S','S'][i]}</span>
                </div>
              ))}
           </div>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-4">
        <h3 className="text-xl font-bold dark:text-white">Achievements</h3>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
           {[
             { icon: Zap, color: 'text-amber-500', bg: 'bg-amber-100', label: '7 Day Streak' },
             { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-100', label: 'Early Bird' },
             { icon: ListTodo, color: 'text-indigo-500', bg: 'bg-indigo-100', label: 'Goal Crusher' },
           ].map((achive, i) => (
             <div key={i} className="flex flex-col items-center gap-3 min-w-[100px]">
               <div className={cn("w-16 h-16 rounded-3xl flex items-center justify-center p-4", achive.bg)}>
                 <achive.icon size={24} className={achive.color} fill="currentColor" opacity={0.2} />
               </div>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">{achive.label}</p>
             </div>
           ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- Variants ---

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15
    }
  }
};

// --- Settings Tab ---

const TabSettings = ({ isDarkMode, setIsDarkMode, tasks, setTasks, reminders, lists, routines }: any) => {
  const { addToast } = useToast();
  const [compactMode, setCompactMode] = useState(false);

  const stats = useMemo(() => {
    const totalPoints = tasks.filter((t: any) => t.completed).length * 15;
    
    // Improved storage calculation based on all database tables
    const dbKeys = Object.values(Table).map(t => `lifeflow_db_${t}`);
    const sizeInBytes = dbKeys.reduce((acc, key) => acc + (localStorage.getItem(key)?.length || 0), 0);
    const storageUsed = (sizeInBytes / 1024).toFixed(2);
    
    return { totalPoints, storageUsed, sizeInBytes };
  }, [tasks, reminders, lists, routines]);

  const clearCompleted = () => {
    if (confirm('Clear all completed tasks?')) {
      setTasks(tasks.filter((t: any) => !t.completed));
    }
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      addToast("Notifications not supported.", "error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      addToast("Notifications enabled!", "success");
    }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-32 px-6 h-full overflow-y-auto no-scrollbar"
    >
      <motion.header variants={itemVariants}>
        <h2 className="text-3xl font-bold dark:text-white">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Personalize your experience</p>
      </motion.header>

      {/* Profile Card */}
      <motion.div variants={itemVariants}>
        <Card className="p-6 border-none bg-indigo-600 dark:bg-slate-900 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-2xl font-black shadow-inner">
              L
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">LifeFlow Pro</h3>
              <p className="text-indigo-100 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">{stats.totalPoints} XP • Level 12</p>
            </div>
            <div className="ml-auto">
               <div className="bg-white/20 backdrop-blur-md text-white p-2.5 rounded-2xl">
                 <ShieldCheck size={20} />
               </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 blur-[80px] rounded-full -mr-24 -mt-24 pointer-events-none" />
        </Card>
      </motion.div>

      {/* Appearance & System */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <motion.section variants={itemVariants} className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Appearance</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
                  <Smartphone size={20} />
                </div>
                <span className="font-bold text-sm dark:text-white">Dark Mode</span>
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={cn(
                  "w-12 h-7 rounded-full relative transition-all duration-300",
                  isDarkMode ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300",
                  isDarkMode ? "left-[23px]" : "left-[4px]"
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500">
                  <Smartphone size={20} className="scale-75" />
                </div>
                <span className="font-bold text-sm dark:text-white">Compact Layout</span>
              </div>
              <button 
                onClick={() => setCompactMode(!compactMode)}
                className={cn(
                  "w-12 h-7 rounded-full relative transition-all duration-300",
                  compactMode ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300",
                  compactMode ? "left-[23px]" : "left-[4px]"
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500">
                  <BellRing size={20} className="scale-75" />
                </div>
                <span className="font-bold text-sm dark:text-white">Notifications</span>
              </div>
              <button 
                onClick={requestPermission}
                className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
              >
                Enable
              </button>
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">System & Storage</h4>
          <div className="space-y-2">
            <Card className="p-4 border-none shadow-sm dark:bg-slate-900">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                   <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500">
                     <HardDrive size={20} />
                   </div>
                   <div>
                     <p className="font-bold text-sm dark:text-white">Local Storage</p>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stats.storageUsed} KB Used</p>
                   </div>
                 </div>
               </div>
               <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                 <div 
                   className="bg-emerald-500 h-full transition-all duration-1000"
                   style={{ width: `${Math.min(100, (stats.sizeInBytes / 5242880) * 100)}%` }}
                 />
               </div>
            </Card>

            <button 
              onClick={clearCompleted}
              className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:bg-rose-50 dark:hover:bg-rose-900/10 group transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 group-hover:scale-110 transition-transform text-xs">
                  <Eraser size={20} />
                </div>
                <span className="font-bold text-sm dark:text-white">Clear Completed</span>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          </div>
        </motion.section>
      </div>

      {/* Account */}
      <motion.section variants={itemVariants} className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Danger Zone</h4>
        <button 
          className="w-full flex items-center gap-3 p-4 bg-rose-500 rounded-2xl text-white shadow-xl shadow-rose-500/20 active:scale-95 transition-all font-bold"
          onClick={() => { if(confirm('Are you sure you want to log out and reset data?')) { localStorage.clear(); window.location.reload(); } }}
        >
          <Power size={20} />
          <span>Reset All App Data</span>
        </button>
      </motion.section>

      <motion.div variants={itemVariants} className="text-center py-4">
        <p className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.4em]">LifeFlow Version 2.4.1</p>
      </motion.div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(() => Storage.get('darkMode', true));
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);

  // State Management
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const [routines, setRoutines] = useState<Routine[]>(() => {
    const saved = Database.getAllSync<Routine[]>(Table.SETTINGS);
    if (saved.length > 0) return saved[0];
    return [
      { id: '1', title: 'Morning Hydration', time: '08:00', days: [0,1,2,3,4,5,6], completed: [] },
      { id: '2', title: 'Daily Workout', time: '07:30', days: [1,3,5], completed: [] },
      { id: '3', title: 'Deep Work', time: '09:00', days: [1,2,3,4,5], completed: [] },
      { id: '4', title: 'Reading Time', time: '22:00', days: [0,1,2,3,4,5,6], completed: [] },
    ];
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = Database.getAllSync<Task>(Table.TASKS);
    if (saved.length > 0) return saved;
    return [
      { id: '1', title: 'Update design system', completed: false, priority: 'high', category: 'Work', date: format(new Date(), 'yyyy-MM-dd'), time: '10:00' },
      { id: '2', title: 'Review mockups', completed: true, priority: 'medium', category: 'Work', date: format(new Date(), 'yyyy-MM-dd'), time: '14:30' },
      { id: '3', title: 'Evening run', completed: false, priority: 'medium', category: 'Health', date: format(new Date(), 'yyyy-MM-dd'), time: '18:00' },
    ];
  });

  const [lists, setLists] = useState<ShoppingList[]>(() => {
    const saved = Database.getAllSync<ShoppingList>(Table.SHOPPING_LISTS);
    if (saved.length > 0) return saved;
    return [
      { id: '1', title: 'Groceries', items: [{ id: '1', text: 'Almond milk', completed: false }, { id: '2', text: 'Avocado', completed: true }] },
    ];
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = Database.getAllSync<Reminder>(Table.REMINDERS);
    if (saved.length > 0) return saved;
    return [
      { id: '1', title: 'Morning Medicine', time: '08:30', active: true, repeat: 'daily' },
      { id: '2', title: 'Drink Water', time: '10:00', active: true, repeat: 'daily' },
    ];
  });

  // Persistence
  useEffect(() => Storage.set('darkMode', isDarkMode), [isDarkMode]);
  
  // Database Sync
  useEffect(() => { Database.saveAll(Table.TASKS, tasks); }, [tasks]);
  useEffect(() => { Database.saveAll(Table.REMINDERS, reminders); }, [reminders]);
  useEffect(() => { Database.saveAll(Table.SHOPPING_LISTS, lists); }, [lists]);
  useEffect(() => { Database.saveAll(Table.SETTINGS, [routines]); }, [routines]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // Memory optimized checker using a ref to avoid unnecessary re-renders of the effect
  const tasksRef = React.useRef(tasks);
  const remindersRef = React.useRef(reminders);
  
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentH = format(now, 'HH');
      const currentM = format(now, 'mm');
      const currentTime = `${currentH}:${currentM}`;
      const todayStr = format(now, 'yyyy-MM-dd');
      const currentDay = now.getDay();

      // Use refs to get latest values without restarting interval
      const currentReminders = remindersRef.current;
      const currentTasks = tasksRef.current;

      // Check Alerts/Reminders
      currentReminders.forEach(reminder => {
        if (!reminder.active) return;
        if (reminder.time === currentTime && reminder.lastTriggered !== `${todayStr}-${currentTime}`) {
          let shouldTrigger = false;
          if (reminder.repeat === 'none' && !reminder.lastTriggered) shouldTrigger = true;
          if (reminder.repeat === 'daily') shouldTrigger = true;
          if (reminder.repeat === 'weekly' && reminder.days?.includes(currentDay)) shouldTrigger = true;

          if (shouldTrigger) {
            setActiveNotification({
              id: Date.now().toString(),
              title: reminder.title,
              description: reminder.description,
              time: reminder.time,
              type: 'reminder',
              originalId: reminder.id
            });
            playNotificationSound();
            showNativeNotification(reminder.title, `Reminder at ${reminder.time}`);
            setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, lastTriggered: `${todayStr}-${currentTime}` } : r));
          }
        }
      });

      // Check Task Reminders
      currentTasks.forEach(task => {
        if (task.reminder && !task.completed && task.date === todayStr && task.time === currentTime) {
          setActiveNotification({
            id: Date.now().toString(),
            title: task.title,
            description: 'Task is due now!',
            time: task.time || currentTime,
            type: 'task',
            originalId: task.id
          });
          playNotificationSound();
          showNativeNotification(task.title, 'Task is due now!');
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, reminder: false } : t));
        }
      });
    };

    const interval = setInterval(checkReminders, 15000); // Check every 15s for better accuracy
    return () => clearInterval(interval);
  }, []); // Empty deps - uses refs for optimized memory and stability

  const onNotificationAction = (originalId: string, action: 'complete' | 'snooze') => {
    if (action === 'complete') {
      if (activeNotification?.type === 'task') {
        setTasks(prev => prev.map(t => t.id === originalId ? { ...t, completed: true } : t));
      } else {
        // Just dismiss for regular reminders in this case
      }
    } else if (action === 'snooze') {
      // Logic for snooze - could delay the reminder
      const now = new Date();
      const snoozeTime = format(new Date(now.getTime() + 5 * 60000), 'HH:mm');
      
      if (activeNotification?.type === 'task') {
        setTasks(prev => prev.map(t => t.id === originalId ? { ...t, time: snoozeTime, reminder: true } : t));
      } else {
        setReminders(prev => prev.map(r => r.id === originalId ? { ...r, time: snoozeTime } : r));
      }
    }
    setActiveNotification(null);
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const navItems = [
    { id: 'home', icon: LayoutGrid, label: 'Home' },
    { id: 'tasks', icon: ListTodo, label: 'Tasks' },
    { id: 'schedule', icon: Calendar, label: 'Schedule' },
    { id: 'lists', icon: ShoppingCart, label: 'Lists' },
    { id: 'reminders', icon: Bell, label: 'Alerts' },
    { id: 'insights', icon: BarChart2, label: 'Insights' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <ToastContext.Provider value={{ addToast }}>
      <div className="min-h-screen bg-slate-100 dark:bg-[#010411] flex flex-col items-center justify-center sm:p-4 lg:p-12 font-sans selection:bg-primary/20 selection:text-primary theme-transition overflow-hidden select-none">
        
        <AnimatePresence>
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onDismiss={() => {}} />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
          {activeNotification && <NotificationAlert notification={activeNotification} onDismiss={() => setActiveNotification(null)} onAction={onNotificationAction} />}
        </AnimatePresence>

        {/* Main Container: Fluid Dashboard for Desktop, Phone Frame for Mobile */}
        <div className={cn(
          "w-full h-full flex flex-col lg:flex-row transition-all duration-700 ease-in-out",
          "sm:max-w-[420px] sm:h-[840px] sm:rounded-[3.5rem] sm:border-[8px] border-slate-200 dark:border-slate-800",
          "lg:max-w-[1400px] lg:h-[90vh] lg:rounded-[3rem] lg:border-none",
          "bg-white dark:bg-[#020617]/95 backdrop-blur-3xl sm:shadow-[0_0_100px_rgba(0,0,0,0.1)] dark:sm:shadow-[0_0_100px_rgba(79,70,229,0.05)] overflow-hidden relative"
        )}>
          {/* Subtle Texture Overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
          
          {/* Desktop Sidebar Navigation */}
          <nav className="hidden lg:flex flex-col w-64 bg-slate-50 dark:bg-slate-900/40 border-r border-slate-100 dark:border-slate-800/50 p-8 z-50 shrink-0">
            <div className="flex items-center gap-3 mb-10 px-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Zap size={22} fill="currentColor" />
              </div>
              <h1 className="text-xl font-bold tracking-tight dark:text-white">LifeFlow</h1>
            </div>

            <div className="flex-1 space-y-2">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all relative group",
                      isActive 
                        ? "text-primary bg-indigo-50 dark:bg-indigo-500/10" 
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.label}</span>
                    {isActive && (
                      <motion.div 
                        layoutId="sidebar-active"
                        className="absolute left-[-1.5rem] w-1.5 h-6 bg-primary rounded-r-full shadow-[2px_0_10px_rgba(79,70,229,0.5)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto space-y-4">
              <div className="p-5 bg-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden group">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Daily Goal</p>
                  <div className="flex justify-between items-end">
                    <h4 className="font-bold">Progress</h4>
                    <span className="text-[10px] font-bold">12/15</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/20 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-white w-3/4 rounded-full" />
                  </div>
                  <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700" />
              </div>
              
              <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="w-full flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl text-slate-500 hover:text-primary transition-all"
              >
                <span className="font-bold text-xs uppercase tracking-widest">{isDarkMode ? 'Light' : 'Dark'} Mode</span>
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </nav>

          <div className="flex-1 flex flex-col min-w-0">
            {/* Top Bar (Mobile & Desktop) */}
            <div className="h-24 lg:h-20 pt-6 lg:pt-0 shrink-0 flex items-center justify-between px-8 z-50 lg:border-b border-slate-100 dark:border-slate-800/30">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-0.5">
                  {format(new Date(), 'EEEE, MMM d')}
                </span>
                <h2 className="text-sm font-bold dark:text-slate-200 lg:hidden">LifeFlow</h2>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => addToast("Search feature is coming soon!", "info")}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-400 hover:text-primary transition-colors border border-slate-200 dark:border-slate-800"
                >
                  <Search size={18} />
                </button>
                <button className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-400 hover:text-primary transition-colors border border-slate-200 dark:border-slate-800 lg:hidden">
                  <Settings size={18} onClick={() => setActiveTab('settings')} />
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="h-full"
                >
                  <div className="h-full overflow-y-auto no-scrollbar pb-32 sm:pb-40 lg:pb-12 lg:px-4">
                    {activeTab === 'home' && <TabHome routines={routines} setRoutines={setRoutines} tasks={tasks} toggleTask={toggleTask} reminders={reminders} setReminders={setReminders} lists={lists} />}
                    {activeTab === 'tasks' && <TabTasks tasks={tasks} setTasks={setTasks} />}
                    {activeTab === 'schedule' && <TabSchedule tasks={tasks} toggleTask={toggleTask} />}
                    {activeTab === 'lists' && <TabLists lists={lists} setLists={setLists} />}
                    {activeTab === 'reminders' && <TabReminders reminders={reminders} setReminders={setReminders} />}
                    {activeTab === 'insights' && <TabInsights tasks={tasks} />}
                    {activeTab === 'settings' && <TabSettings isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} tasks={tasks} setTasks={setTasks} reminders={reminders} lists={lists} routines={routines} />}
                  </div>
                </motion.div>
              </AnimatePresence>
            </main>
          </div>

          {/* Bottom Navigation (Mobile Only) */}
          <nav className="absolute bottom-0 left-0 right-0 h-24 sm:h-28 nav-blur flex items-center justify-around px-4 pb-6 sm:pb-8 z-[100] lg:hidden">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="flex flex-col items-center gap-1.5 transition-all p-2 relative group"
                >
                  {isActive && (
                    <motion.div 
                      layoutId="active-tab-nav"
                      className="absolute inset-0 bg-primary/5 dark:bg-primary/20 rounded-2xl"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <div className={cn(
                    "relative transition-all duration-300 z-10",
                    isActive ? "text-primary scale-110" : "text-slate-400 dark:text-slate-600 group-hover:text-slate-500"
                  )}>
                    <item.icon size={26} strokeWidth={isActive ? 2.5 : 1.5} />
                    {isActive && (
                      <motion.div 
                        layoutId="nav-dot"
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]"
                      />
                    )}
                  </div>
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-[0.1em] transition-opacity duration-300",
                    isActive ? "text-primary opacity-100" : "opacity-0"
                  )}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Notch / Handle (Mobile Only) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-slate-900 dark:bg-black rounded-b-[24px] z-[200] flex items-center justify-center lg:hidden">
            <div className="w-12 h-1 bg-white/10 rounded-full" />
          </div>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

