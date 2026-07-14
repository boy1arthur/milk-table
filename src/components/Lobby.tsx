import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, User, Crown, Users, Plus } from 'lucide-react';

export default function Lobby() {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'viewer' | 'host'>('viewer');
  const [newRoomName, setNewRoomName] = useState('');
  const navigate = useNavigate();

  const handleJoin = (roomId: string) => {
    if (!name.trim()) {
      alert('성함을 입력해주세요.');
      return;
    }
    navigate(`/room/${encodeURIComponent(roomId)}`, { state: { name, role, isHost: role === 'host' } });
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      handleJoin(newRoomName.trim());
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-milk-bg)] flex items-center justify-center p-6 font-sans text-[var(--color-milk-text)]">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-[var(--color-milk-accent)] rounded-2xl mx-auto flex items-center justify-center shadow-sm">
            <BookOpen className="w-8 h-8 text-[var(--color-milk-bg)]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-milk-text)]">Milk Table</h1>
          <div className="space-y-3 pt-2 text-center">
            <p className="text-xl md:text-2xl text-[var(--color-milk-dark)] font-medium italic">
              "두세 사람이 내 이름으로 모인 곳에는 나도 그들 중에 있느니라"
            </p>
            <p className="text-sm md:text-base text-[var(--color-milk-muted)] font-bold">
              (Matthew 18: 20)
            </p>
          </div>
        </div>

        <div className="space-y-6 bg-[var(--color-milk-panel)] p-8 rounded-3xl border border-[var(--color-milk-border)] shadow-sm">
          {/* Name Input */}
          <div className="space-y-3">
            <label className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wide text-[var(--color-milk-muted)]">
              <span>참여 성도님 성함</span>
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-[var(--color-milk-bg)] border border-[var(--color-milk-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-milk-accent)] outline-none transition-all"
              placeholder="성함을 적어주세요 (예: 홍길동)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Role Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--color-milk-muted)]">역할 선택</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole('viewer')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all ${
                  role === 'viewer'
                    ? 'border-[var(--color-milk-accent)] bg-[var(--color-milk-accent)]/5 text-[var(--color-milk-text)] shadow-sm'
                    : 'border-[var(--color-milk-border)] bg-[var(--color-milk-bg)] text-[var(--color-milk-muted)] hover:border-[var(--color-milk-accent)]/50'
                }`}
              >
                <User className={`w-6 h-6 ${role === 'viewer' ? 'text-[var(--color-milk-accent)]' : ''}`} />
                <span className="font-semibold text-sm">조원 (시청자)</span>
              </button>
              <button
                onClick={() => setRole('host')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all ${
                  role === 'host'
                    ? 'border-[var(--color-milk-accent)] bg-[var(--color-milk-accent)]/5 text-[var(--color-milk-text)] shadow-sm'
                    : 'border-[var(--color-milk-border)] bg-[var(--color-milk-bg)] text-[var(--color-milk-muted)] hover:border-[var(--color-milk-accent)]/50'
                }`}
              >
                <Crown className={`w-6 h-6 ${role === 'host' ? 'text-amber-500' : ''}`} />
                <span className="font-semibold text-sm">조장 (방장)</span>
              </button>
            </div>
          </div>

          {/* Room Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--color-milk-muted)]">입장할 소그룹 방 선택</label>
            <div className="space-y-2">
              {['1조 학습방', '2조 학습방', '3조 학습방'].map((room) => (
                <button
                  key={room}
                  onClick={() => handleJoin(room)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-[var(--color-milk-border)] bg-[var(--color-milk-bg)] hover:bg-[var(--color-milk-panel)] hover:border-[var(--color-milk-accent)]/50 transition-all group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-milk-panel)] border border-[var(--color-milk-border)] flex items-center justify-center group-hover:shadow-sm transition-all">
                      <Users className="w-4 h-4 text-[var(--color-milk-muted)]" />
                    </div>
                    <span className="font-medium text-sm">{room}</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">입장하기</span>
                </button>
              ))}
            </div>
          </div>

          {/* Create Room */}
          <div className="pt-4 border-t border-[var(--color-milk-border)] space-y-3">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--color-milk-muted)]">즉석 방 개설</label>
            <form onSubmit={handleCreateRoom} className="flex space-x-2">
              <input
                type="text"
                className="flex-1 px-4 py-3 bg-[var(--color-milk-bg)] border border-[var(--color-milk-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-milk-accent)] outline-none transition-all text-sm"
                placeholder="예: 청년 1부, 새가족반"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <button
                type="submit"
                className="px-6 py-3 bg-[var(--color-milk-text)] text-[var(--color-milk-bg)] font-medium text-sm rounded-xl hover:bg-[var(--color-milk-dark)] transition-colors shadow-sm flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                개설
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
