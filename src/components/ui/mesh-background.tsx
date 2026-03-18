"use client";

import { motion } from "framer-motion";

export function MeshBackground() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      {/* Círculo 1: Azul Primario */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -top-[10%] -left-[10%] h-[50%] w-[50%] rounded-full bg-primary/5 blur-[120px]"
      />
      
      {/* Círculo 2: Violeta/Indigo */}
      <motion.div
        animate={{
          x: [0, -100, 0],
          y: [0, 100, 0],
          scale: [1.2, 1, 1.2],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute top-[20%] -right-[10%] h-[60%] w-[60%] rounded-full bg-indigo-500/5 blur-[150px]"
      />
      
      {/* Círculo 3: Cyan/Esmeralda */}
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -50, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute bottom-[0%] left-[20%] h-[40%] w-[40%] rounded-full bg-cyan-500/5 blur-[100px]"
      />
    </div>
  );
}
