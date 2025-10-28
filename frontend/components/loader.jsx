"use client";

import React from "react";

const Loader = () => {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="flex space-x-2">
        <div className="w-4 h-4 bg-green-400 rounded-full animate-bounce delay-0" />
        <div className="w-4 h-4 bg-blue-400 rounded-full animate-bounce delay-200" />
        <div className="w-4 h-4 bg-purple-400 rounded-full animate-bounce delay-400" />
      </div>

      <style jsx>{`
        .animate-bounce {
          animation: bounce 1.2s infinite ease-in-out;
        }

        .delay-0 {
          animation-delay: 0s;
        }

        .delay-200 {
          animation-delay: 0.2s;
        }

        .delay-400 {
          animation-delay: 0.4s;
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default Loader;
