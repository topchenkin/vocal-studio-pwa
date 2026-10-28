"use client";

import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";

const LEAD = ["Уроки", "вокала"] as const;
const ACCENT = ["в", "Екатеринбурге", "и", "онлайн"] as const;
const LABEL = "Уроки вокала в Екатеринбурге и онлайн";

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
      aria-label={LABEL}
      className="font-display text-4xl font-semibold leading-[1.08] text-studio-text sm:text-6xl lg:text-7xl"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05 } },
      }}
      initial={reduce ? false : "hidden"}
      animate="show"
    >
      {/* Real spaces between words: textContent must read as a sentence for search bots. */}
      {LEAD.map((item) => (
        <Fragment key={item}>
          <motion.span variants={word} className="inline-block">
            {item}
          </motion.span>{" "}
        </Fragment>
      ))}
      <span>
        {ACCENT.map((item, index) => (
          <Fragment key={item}>
            <motion.span
              variants={word}
              className="inline-block text-gradient"
            >
              {item}
            </motion.span>
            {index < ACCENT.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </motion.h1>
  );
}
