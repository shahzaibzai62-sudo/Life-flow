
import React from 'react';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-indigo-950"
    >
      <div className="relative">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
          animate={{ 
            scale: [0.5, 1.1, 1], 
            opacity: 1, 
            rotate: 0 
          }}
          transition={{ 
            duration: 1.2, 
            ease: "circOut",
            times: [0, 0.7, 1]
          }}
          className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-primary/40 relative z-10"
        >
          <Zap size={48} fill="currentColor" />
        </motion.div>
        
        {/* Decorative rings */}
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0.2 }}
          transition={{ duration: 1.5, repeat: Infinity, repeatType: "loop" }}
          className="absolute inset-0 border-2 border-primary rounded-[2rem]"
        />
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 2, opacity: 0.1 }}
          transition={{ duration: 2, delay: 0.5, repeat: Infinity, repeatType: "loop" }}
          className="absolute inset-0 border-2 border-primary rounded-[2rem]"
        />
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="mt-8 text-center"
      >
        <h1 className="text-4xl font-bold font-display tracking-tighter text-white mb-2">
          Life<span className="text-primary">Flow</span>
        </h1>
        <div className="flex gap-1 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3]
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                delay: i * 0.2 
              }}
              className="w-1.5 h-1.5 bg-primary rounded-full"
            />
          ))}
        </div>
      </motion.div>
      
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
    </motion.div>
  );
};
