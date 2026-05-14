"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

interface MotionWrapperProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  type?: "bounce" | "fade" | "slideUp";
  delay?: number;
}

export function MotionWrapper({ 
  children, 
  type = "fade", 
  delay = 0, 
  className,
  ...props 
}: MotionWrapperProps) {
  const variants = {
    bounce: {
      initial: { scale: 0.9, opacity: 0 },
      animate: { 
        scale: 1, 
        opacity: 1,
        transition: { type: "spring", stiffness: 300, damping: 15, delay }
      },
      whileHover: { scale: 1.05, transition: { type: "spring", stiffness: 400, damping: 10 } },
      whileTap: { scale: 0.95 }
    },
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.5, delay } }
    },
    slideUp: {
      initial: { y: 20, opacity: 0 },
      animate: { y: 0, opacity: 1, transition: { duration: 0.4, ease: "easeOut", delay } }
    }
  };

  return (
    <motion.div
      variants={variants[type]}
      initial="initial"
      animate="animate"
      whileHover={type === "bounce" ? "whileHover" : undefined}
      whileTap={type === "bounce" ? "whileTap" : undefined}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
