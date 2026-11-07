"use client";

/* Adapted from Kokonut Pro Chat History. Native rows own all chat actions. */
import { type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Text } from "@opal/components";
import type { ChatSession } from "@/app/app/interfaces";

interface ChatHistoryProps {
  chats: ChatSession[];
  renderChat: (chat: ChatSession) => ReactNode;
}

export default function ChatHistory({ chats, renderChat }: ChatHistoryProps) {
  const t = useTranslations("customerPro.history");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  week.setDate(today.getDate() - 7);
  const groups = ["today", "yesterday", "week", "earlier"] as const;
  function group(chat: ChatSession) {
    const date = new Date(chat.time_updated || chat.time_created);
    if (date >= today) return "today";
    if (date >= yesterday) return "yesterday";
    if (date >= week) return "week";
    return "earlier";
  }

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="min-w-0 [scrollbar-width:thin]">
        {groups.map((key) => {
          const list = chats.filter((chat) => group(chat) === key);
          if (!list.length) return null;
          return (
            <section
              key={key}
              aria-label={t(key)}
              className="group/pro-history"
            >
              <div className="px-3 pt-4 pb-1 group-first/pro-history:pt-1">
                <Text as="h3" font="secondary-body" color="text-02">
                  {t(key)}
                </Text>
              </div>
              <ul>
                <AnimatePresence initial={false}>
                  {list.map((chat) => (
                    <motion.li
                      key={chat.id}
                      layout="position"
                      initial={{ y: -4, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28 }}
                    >
                      {renderChat(chat)}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          );
        })}
      </div>
    </MotionConfig>
  );
}
