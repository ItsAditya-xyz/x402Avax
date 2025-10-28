"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "../lib/supabaseClient";
import { Home, User, Trophy, LogOut } from "lucide-react";

export default function Header() {
  const [user, setUser] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  
    // rouet to landing page
    router.push("/");
    router.refresh();
      setUser(null);
  };

  return (
    <header className='w-full bg-[#121417] px-6 py-4 flex justify-between items-center border-b border-[#2c2f36] h-20'>
      {/* Logo */}
      <Link href='/' className='flex items-center gap-2'>
      <div className="bg-white rounded-full">
 <Image src='/assets/cook120.png' alt='Logo' width={40} height={40} />
      </div>
       
        <span className='font-bold text-xl text-white'>COOK</span>
      </Link>

      {/* Right Side */}
      {user && (
        <div className='relative' ref={dropdownRef}>
          <button
            className='flex items-center gap-3 outline-none bg-[#181B21] border border-[#2c2f36] px-4 py-2 rounded-md hover:bg-[#222630] transition'
            onClick={() => setOpenDropdown(!openDropdown)}>
            <p className='font-medium text-white hidden sm:block'>
              GM, {user.user_metadata?.user_name || "Player"}
            </p>
            <Image
              src={
                user.user_metadata?.avatar_url || "/assets/default-avatar.png"
              }
              alt='Avatar'
              width={36}
              height={36}
              className='rounded-full border border-none'
            />
          </button>

          {openDropdown && (
            <div className='absolute right-0 mt-2 w-56 bg-[#181B21] border border-[#2c2f36] py-3 text-white z-50'>
              <Link
                href='/app'
                className='flex items-center gap-3 px-4 py-3 hover:bg-[#222630]'>
                <Home size={18} /> Home
              </Link>
              {/* <Link
                href={`/u/${user?.user_metadata?.user_name || "player"}`}
                className='flex items-center gap-3 px-4 py-3 hover:bg-[#222630]'>
                <User size={18} /> Profile
              </Link> */}
             
              <button
                onClick={handleLogout}
                className='flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-[#222630] w-full text-left'>
                <LogOut size={18} /> Log out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
