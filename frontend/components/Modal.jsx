"use client";
import React from "react";
import { X } from "lucide-react";
import classNames from "classnames";

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
 <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex justify-center items-center">
      <div className="bg-[#181B21] border border-[#2c2f36] rounded-lg w-full max-w-md p-6 shadow-lg relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        <div className="text-sm text-gray-300">{children}</div>
      </div>
    </div>
  );
}
