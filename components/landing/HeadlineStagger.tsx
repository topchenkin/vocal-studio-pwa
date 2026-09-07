"use client";

import { motion, useReducedMotion } from "framer-motion";

const LEAD = ["Голос", "раскрывается,", "когда", "рядом"] as const;
const ACCENT = ["наставник", "и", "умная", "практика"] as const;

export default function HeadlineStagger() {
  const reduce = useReducedMotion();
  const word = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
        },
      };

  return (
    <motion.h1
      className="font-display text-4xl font-semibold leading-[1.08] sm:text-6xl lg:text-7xl"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05 } },
      }}
      initial={reduce ? false : "hidden"}
      animate="show"
    >
      {LEAD.map((item) => (
        <motion.span
          key={item}
          variants={word}
          className="mr-[0.28em] inline-block"
        >
          {item}
        </motion.span>
      ))}
      <span>
        {ACCENT.map((item) => (
          <motion.span
            key={item}
            variants={word}
            className="mr-[0.28em] inline-block text-gradient last:mr-0"
          >
            {item}
          </motion.span>
        ))}
      </span>
    </motion.h1>
  );
}
